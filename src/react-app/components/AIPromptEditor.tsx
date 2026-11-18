import { PromptEditor } from "./PromptEditor";

type AIPromptEditorProps = {
	embedded?: boolean;
};

export function AIPromptEditor({ embedded }: AIPromptEditorProps) {
	return <PromptEditor embedded={embedded} filterControlMode="input" />;
}
