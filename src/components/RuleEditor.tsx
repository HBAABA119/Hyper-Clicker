import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";

interface RuleEditorProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Rhai syntax is close enough to JavaScript for the highlighter to be useful,
 * and CodeMirror 6 is orders of magnitude lighter than Monaco inside a Tauri
 * webview.
 */
export default function RuleEditor({ value, onChange }: RuleEditorProps) {
  return (
    <CodeMirror
      value={value}
      height="100%"
      extensions={[javascript()]}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: false,
      }}
      className="h-full text-[0.8125rem]"
    />
  );
}