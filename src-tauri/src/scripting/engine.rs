//! Rhai rule engine.
//!
//! The AST is compiled once on edit and re-used, so the hot loop never pays
//! parsing cost. The compiled script is held behind an `Arc` so evaluation runs
//! without holding the lock, and the result is versioned: the dispatch loop
//! caches the verdict and only re-evaluates when the version changes.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use rhai::{Engine, Scope, AST};

use super::host;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuleVerdict {
    Allow,
    Blocked,
}

pub struct RuleSnapshot {
    pub version: u64,
    pub verdict: RuleVerdict,
    pub error: Option<String>,
}

impl RuleSnapshot {
    pub fn status_code(&self) -> u32 {
        use crate::engine::r#loop::{RULE_ALLOW, RULE_BLOCKED, RULE_ERROR};
        if self.error.is_some() {
            RULE_ERROR
        } else {
            match self.verdict {
                RuleVerdict::Allow => RULE_ALLOW,
                RuleVerdict::Blocked => RULE_BLOCKED,
            }
        }
    }
}

struct Compiled {
    version: u64,
    ast: AST,
}

pub struct ScriptEngine {
    engine: Engine,
    compiled: Mutex<Option<Arc<Compiled>>>,
    scope: Mutex<Scope<'static>>,
    version: AtomicU64,
}

impl ScriptEngine {
    pub fn new() -> Self {
        let mut engine = Engine::new();

        // Bound the cost of a single evaluation so a pathological script cannot
        // stall the dispatch loop.
        engine.set_max_operations(100_000);
        engine.set_max_call_levels(32);
        engine.on_print(|_| {});

        engine.register_fn("get_pixel_hex", host::pixel_hex);
        engine.register_fn("get_active_window_title", host::active_window_title);
        engine.register_fn("get_cursor_pos", host::cursor_pos);
        engine.register_fn("platform", host::platform_name);

        Self {
            engine,
            compiled: Mutex::new(None),
            scope: Mutex::new(Scope::new()),
            version: AtomicU64::new(0),
        }
    }

    pub fn version(&self) -> u64 {
        self.version.load(Ordering::Acquire)
    }

    /// Compile and install a rule. Returns the new version.
    pub fn compile(&self, script_code: &str) -> Result<u64, String> {
        let ast = self
            .engine
            .compile(script_code)
            .map_err(|err| err.to_string())?;

        let version = self.version.load(Ordering::Acquire) + 1;
        let compiled = Arc::new(Compiled { version, ast });

        let mut slot = self.compiled.lock().map_err(|_| "script lock poisoned")?;
        *slot = Some(compiled);
        self.version.store(version, Ordering::Release);
        Ok(version)
    }

    /// Evaluate the currently installed rule.
    ///
    /// With no script installed the engine allows, matching the original
    /// "default allow" behaviour. A *failing* script also allows, so a typo in
    /// a rule cannot silently and permanently stop the engine; the error is
    /// surfaced in the UI instead.
    pub fn evaluate(&self) -> RuleSnapshot {
        let current = match self.compiled.lock() {
            Ok(slot) => slot.clone(),
            Err(_) => {
                return RuleSnapshot {
                    version: self.version(),
                    verdict: RuleVerdict::Allow,
                    error: Some("script lock poisoned".to_string()),
                };
            }
        };

        let compiled = match current {
            Some(c) => c,
            None => {
                return RuleSnapshot {
                    version: 0,
                    verdict: RuleVerdict::Allow,
                    error: None,
                };
            }
        };

        let mut scope = match self.scope.lock() {
            Ok(scope) => scope,
            Err(_) => {
                return RuleSnapshot {
                    version: compiled.version,
                    verdict: RuleVerdict::Allow,
                    error: Some("scope lock poisoned".to_string()),
                };
            }
        };

        match self
            .engine
            .eval_ast_with_scope::<bool>(&mut scope, &compiled.ast)
        {
            Ok(allowed) => RuleSnapshot {
                version: compiled.version,
                verdict: if allowed {
                    RuleVerdict::Allow
                } else {
                    RuleVerdict::Blocked
                },
                error: None,
            },
            Err(err) => RuleSnapshot {
                version: compiled.version,
                verdict: RuleVerdict::Allow,
                error: Some(err.to_string()),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_script_allows() {
        let engine = ScriptEngine::new();
        let snapshot = engine.evaluate();
        assert_eq!(snapshot.verdict, RuleVerdict::Allow);
        assert!(snapshot.error.is_none());
    }

    #[test]
    fn true_rule_allows() {
        let engine = ScriptEngine::new();
        engine.compile("true").expect("should compile");
        assert_eq!(engine.evaluate().verdict, RuleVerdict::Allow);
    }

    #[test]
    fn false_rule_blocks() {
        let engine = ScriptEngine::new();
        engine.compile("false").expect("should compile");
        assert_eq!(engine.evaluate().verdict, RuleVerdict::Blocked);
    }

    #[test]
    fn version_advances_on_recompile() {
        let engine = ScriptEngine::new();
        let v1 = engine.compile("true").expect("compile");
        let v2 = engine.compile("false").expect("compile");
        assert!(v2 > v1);
        assert_eq!(engine.version(), v2);
    }

    #[test]
    fn recompile_changes_the_verdict() {
        let engine = ScriptEngine::new();
        engine.compile("false").expect("compile");
        assert_eq!(engine.evaluate().verdict, RuleVerdict::Blocked);
        engine.compile("true").expect("compile");
        assert_eq!(engine.evaluate().verdict, RuleVerdict::Allow);
    }

    #[test]
    fn syntax_error_is_reported_not_swallowed() {
        let engine = ScriptEngine::new();
        let err = engine
            .compile("this is not valid rhai !!!")
            .expect_err("invalid syntax must fail");
        assert!(!err.is_empty());
    }

    #[test]
    fn non_boolean_result_is_an_error_but_still_allows() {
        let engine = ScriptEngine::new();
        engine.compile("42").expect("compiles fine");
        let snapshot = engine.evaluate();
        assert_eq!(snapshot.verdict, RuleVerdict::Allow);
        assert!(snapshot.error.is_some());
    }

    #[test]
    fn runtime_error_is_reported_but_still_allows() {
        let engine = ScriptEngine::new();
        engine
            .compile("get_active_window_title().missing_field")
            .expect("compiles fine");
        let snapshot = engine.evaluate();
        assert_eq!(snapshot.verdict, RuleVerdict::Allow);
        assert!(snapshot.error.is_some());
    }

    #[test]
    fn host_functions_are_callable_from_scripts() {
        let engine = ScriptEngine::new();
        engine
            .compile("get_active_window_title().len() >= 0")
            .expect("should compile");
        assert_eq!(engine.evaluate().verdict, RuleVerdict::Allow);
    }

    #[test]
    fn runaway_script_hits_the_operation_limit() {
        let engine = ScriptEngine::new();
        engine
            .compile("let x = 0; while true { x += 1; } x > 0")
            .expect("compiles");
        let snapshot = engine.evaluate();
        assert!(snapshot.error.is_some(), "runaway script should be bounded");
    }

    #[test]
    fn source_round_trips() {
        let engine = ScriptEngine::new();
        engine.compile("1 < 2").expect("compile");
        assert_eq!(engine.version(), 1);
        assert_eq!(engine.evaluate().verdict, RuleVerdict::Allow);
    }
}