import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import "../styles/AIChat.css";

type AIChatProps = {
	embedded?: boolean;
	onBackToDashboard?: () => void;
};

type ChatRole = "system" | "user" | "assistant";

type ChatMessage = {
	id: string;
	role: ChatRole;
	content: string;
	status?: "pending" | "error";
};

const MODEL_OPTIONS = [{ value: "@cf/zai-org/glm-4.7-flash", label: "GLM 4.7 Flash" }];

function makeId() {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function AIChat({ embedded = false, onBackToDashboard }: AIChatProps) {
	const [messages, setMessages] = useState<ChatMessage[]>([
		{
			id: makeId(),
			role: "assistant",
			content: "Hello. I am ready to chat with you.",
		},
	]);
	const [draft, setDraft] = useState("");
	const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0].value);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const messagesEndRef = useRef<HTMLDivElement | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [messages, loading]);

	const messageCountLabel = useMemo(() => {
		const count = messages.filter((message) => message.role !== "system").length;
		return `${count} message${count === 1 ? "" : "s"}`;
	}, [messages]);

	const readResponseText = (payload: unknown) => {
		if (!payload || typeof payload !== "object") return "";
		const candidate = payload as {
			response?: string;
			choices?: Array<{ message?: { content?: string | null } }>;
			message?: string;
			text?: string;
		};
		return String(candidate.response || candidate.choices?.[0]?.message?.content || candidate.message || candidate.text || "").trim();
	};

	const handleSend = async () => {
		const text = draft.trim();
		if (!text || loading) return;

		const nextUserMessage: ChatMessage = { id: makeId(), role: "user", content: text };
		const outgoingMessages = [...messages, nextUserMessage].map((message) => ({
			role: message.role,
			content: message.content,
		}));

		setMessages((current) => [...current, nextUserMessage]);
		setDraft("");
		setLoading(true);
		setError("");

		try {
			const response = await fetch("/api/ai-chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: selectedModel,
					messages: [
						{
							role: "system",
							content: "You are a helpful ChatGPT-style assistant that responds clearly and naturally.",
						},
						...outgoingMessages,
					],
				}),
			});

			const data = (await response.json().catch(() => ({}))) as unknown;
			if (!response.ok) {
				const payload = data as { error?: string };
				throw new Error(payload?.error || "AI request failed");
			}

			const assistantContent = readResponseText(data) || "No response returned.";
			setMessages((current) => [...current, { id: makeId(), role: "assistant", content: assistantContent }]);
		} catch (requestError) {
			const message = requestError instanceof Error ? requestError.message : "Request failed";
			setError(message);
			setMessages((current) => [
				...current,
				{ id: makeId(), role: "assistant", content: message, status: "error" },
			]);
		} finally {
			setLoading(false);
			textareaRef.current?.focus();
		}
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			handleSend();
		}
	};

	const clearChat = () => {
		setMessages([
			{
				id: makeId(),
				role: "assistant",
				content: "Hello. I am ready to chat with you.",
			},
		]);
		setDraft("");
		setError("");
	};

	return (
		<div className="ai-chat-shell">
			<div className="ai-chat-header">
				<div>
					<p className="ai-chat-eyebrow">Cloudflare Workers AI</p>
					<h2>AI-Chat</h2>
					<p className="ai-chat-subtitle">ChatGPT-style conversation using GLM 4.7 Flash.</p>
				</div>

				<div className="ai-chat-header-actions">
					<label className="ai-chat-field">
						<span>Model</span>
						<select value={selectedModel} onChange={(event) => setSelectedModel(event.currentTarget.value)}>
							{MODEL_OPTIONS.map((model) => (
								<option key={model.value} value={model.value}>
									{model.label}
								</option>
							))}
						</select>
					</label>

					<div className="ai-chat-buttons">
						<button type="button" className="ai-chat-secondary-button" onClick={clearChat}>
							Clear
						</button>
					</div>
				</div>
			</div>

			<div className="ai-chat-statusbar">
				<span>{messageCountLabel}</span>
				<span>{loading ? "Thinking..." : "Ready"}</span>
			</div>

			<div className="ai-chat-panel">
				<div className="ai-chat-messages" role="log" aria-live="polite" aria-label="Chat messages">
					{messages.map((message) => (
						<div key={message.id} className={`ai-chat-message ai-chat-message--${message.role}`}>
							<div className="ai-chat-avatar">{message.role === "assistant" ? "AI" : message.role === "user" ? "You" : "Sys"}</div>
							<div className={`ai-chat-bubble${message.status === "error" ? " ai-chat-bubble--error" : ""}`}>
								{message.content}
							</div>
						</div>
					))}
					{loading ? (
						<div className="ai-chat-message ai-chat-message--assistant">
							<div className="ai-chat-avatar">AI</div>
							<div className="ai-chat-bubble ai-chat-bubble--typing">Thinking...</div>
						</div>
					) : null}
					<div ref={messagesEndRef} />
				</div>

				<div className="ai-chat-composer">
					<textarea
						ref={textareaRef}
						value={draft}
						onChange={(event) => setDraft(event.currentTarget.value)}
						onKeyDown={handleKeyDown}
						placeholder="Write your message..."
						rows={4}
					/>
					<div className="ai-chat-composer-footer">
						<p className="ai-chat-hint">Press Enter to send, Shift+Enter for a new line.</p>
						<button type="button" className="ai-chat-send-button" onClick={handleSend} disabled={loading || !draft.trim()}>
							{loading ? "Sending..." : "Send"}
						</button>
					</div>
					{error ? <p className="ai-chat-error">{error}</p> : null}
				</div>
			</div>
		</div>
	);
}