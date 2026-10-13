import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
	sourceQuestion?: string;
	status?: "pending" | "error";
};

const MODEL_OPTIONS = [
	{ value: "@cf/zai-org/glm-4.7-flash", label: "GLM 4.7 Flash" },
	{ value: "@cf/meta/llama-3.2-1b-instruct", label: "Llama 3.2 1B Instruct" },
	{ value: "@cf/meta/llama-3.2-3b-instruct", label: "Llama 3.2 3B Instruct" },
	{ value: "@cf/google/gemma-7b-it-lora", label: "Gemma 7B IT LoRA" },
	{ value: "@cf/mistralai/mistral-small-3.1-24b-instruct", label: "Mistral Small 3.1 24B Instruct" },
	{ value: "@cf/nvidia/nemotron-3-120b-a12b", label: "Nemotron 3 120B A12B" },
	{ value: "@cf/openai/gpt-oss-120b", label: "GPT OSS 120B" },
	{ value: "@cf/cloudflare/clef-flash", label: "Clef Flash" },
];

function makeId() {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type SavedHistoryItem = {
	id: number;
	title: string;
	content: string;
	created_at: string;
};

const SAMPLE_HISTORY: SavedHistoryItem[] = [
	{
		id: 1,
		title: "Website copy ideas",
		content: "Here are a few product headline ideas:\n\n- Launch faster with clarity\n- Build smarter workflows\n- Turn ideas into action",
		created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
	},
	{
		id: 2,
		title: "Meeting summary",
		content: "Summary:\n\n- Confirmed product launch timeline\n- Agreed on marketing plan\n- Next step is to review the onboarding flow",
		created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
	},
];

const HISTORY_PAGE_SIZE = 10;

function MarkdownContent({ content, className }: { content: string; className?: string }) {
	return (
		<div className={className}>
			<ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
		</div>
	);
}

export function AIChat(_props: AIChatProps) {
	const [messages, setMessages] = useState<ChatMessage[]>(
		[
			{
				id: makeId(),
				role: "assistant",
				content: "Hello. I am ready to chat with you.",
			},
		]
	);
	const [draft, setDraft] = useState("");
	const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0].value);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [activeTab, setActiveTab] = useState<"chat" | "history">("chat");
	const [savedHistory, setSavedHistory] = useState<SavedHistoryItem[]>(SAMPLE_HISTORY);
	const [historySearch, setHistorySearch] = useState("");
	const [historyPage, setHistoryPage] = useState(1);
	const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);
	const [savedMessageIds, setSavedMessageIds] = useState<Record<string, boolean>>({});
	const [saveDialog, setSaveDialog] = useState<{ open: boolean; messageId: string | null; title: string; content: string }>(
		{
			open: false,
			messageId: null,
			title: "",
			content: "",
		}
	);
	const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: number | null; title: string }>({
		open: false,
		id: null,
		title: "",
	});
	const messagesEndRef = useRef<HTMLDivElement | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	const loadSavedHistory = async () => {
		try {
			const response = await fetch("/api/saved-history");
			const payload = (await response.json().catch(() => ({ results: SAMPLE_HISTORY }))) as { results?: SavedHistoryItem[] };
			if (!response.ok) {
				throw new Error("Unable to load history");
			}
			const nextHistory = Array.isArray(payload.results) && payload.results.length > 0 ? payload.results : SAMPLE_HISTORY;
			setSavedHistory(nextHistory);
		} catch (historyError) {
			setSavedHistory(SAMPLE_HISTORY);
			setError(historyError instanceof Error ? historyError.message : "Unable to load history");
		}
	};

	useEffect(() => {
		if (activeTab === "history") {
			void loadSavedHistory();
		}
	}, [activeTab]);

	const openSaveDialog = (message: ChatMessage) => {
		if (!message.content) return;
		setSaveDialog({
			open: true,
			messageId: message.id,
			title: (message.sourceQuestion || "Untitled chat").trim() || "Untitled chat",
			content: message.content,
		});
	};

	const closeSaveDialog = () => {
		setSaveDialog({ open: false, messageId: null, title: "", content: "" });
	};

	const saveResponseMessage = async () => {
		if (!saveDialog.messageId || !saveDialog.content.trim()) return;

		try {
			const response = await fetch("/api/saved-history", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					title: saveDialog.title.trim() || "Untitled chat",
					content: saveDialog.content,
				}),
			});

			const payload = (await response.json().catch(() => ({}))) as { error?: string };
			if (!response.ok) {
				throw new Error(payload?.error || "Unable to save chat response");
			}

			setSavedMessageIds((current) => ({ ...current, [saveDialog.messageId as string]: true }));
			closeSaveDialog();
			setError("");
			if (activeTab === "history") {
				void loadSavedHistory();
			}
		} catch (saveError) {
			setError(saveError instanceof Error ? saveError.message : "Unable to save chat response");
		}
	};

	const saveResponseMessageLegacy = async (message: ChatMessage) => {
		if (!message.content || savedMessageIds[message.id]) return;
		openSaveDialog(message);
	};

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
			setMessages((current) => [
				...current,
				{ id: makeId(), role: "assistant", content: assistantContent, sourceQuestion: text },
			]);
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

	const filteredHistory = useMemo(() => {
		const searchTerm = historySearch.trim().toLowerCase();
		if (!searchTerm) return savedHistory;
		return savedHistory.filter((item) => item.title.toLowerCase().includes(searchTerm));
	}, [historySearch, savedHistory]);

	const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE)), [filteredHistory.length]);

	useEffect(() => {
		setHistoryPage((current) => Math.min(current, totalPages));
	}, [totalPages]);

	useEffect(() => {
		setHistoryPage(1);
	}, [historySearch]);

	const displayHistory = useMemo(() => {
		const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
		return filteredHistory.slice(start, start + HISTORY_PAGE_SIZE);
	}, [filteredHistory, historyPage]);

	const toggleHistoryItem = (id: number) => {
		setExpandedHistoryId((current) => (current === id ? null : id));
	};

	const deleteHistoryEntry = async () => {
		if (!deleteDialog.id) return;

		try {
			const response = await fetch(`/api/saved-history/${deleteDialog.id}`, {
				method: "DELETE",
			});

			const payload = (await response.json().catch(() => ({}))) as { error?: string };
			if (!response.ok) {
				throw new Error(payload?.error || "Unable to delete history");
			}

			setSavedHistory((current) => current.filter((item) => item.id !== deleteDialog.id));
			setExpandedHistoryId((current) => (current === deleteDialog.id ? null : current));
			setDeleteDialog({ open: false, id: null, title: "" });
			setError("");
		} catch (deleteError) {
			setError(deleteError instanceof Error ? deleteError.message : "Unable to delete history");
		}
	};

	const openDeleteDialog = (item: SavedHistoryItem) => {
		setDeleteDialog({ open: true, id: item.id, title: item.title || "This history item" });
	};

	const closeDeleteDialog = () => {
		setDeleteDialog({ open: false, id: null, title: "" });
	};

	return (
		<div className="ai-chat-shell">
			<div className="ai-chat-header">
				<div>
					<div className="ai-chat-tabs" role="tablist" aria-label="AI Chat views">
				<button type="button" className={activeTab === "chat" ? "ai-chat-tab ai-chat-tab--active" : "ai-chat-tab"} onClick={() => setActiveTab("chat")} role="tab" aria-selected={activeTab === "chat"}>
					Chat
				</button>
				<button type="button" className={activeTab === "history" ? "ai-chat-tab ai-chat-tab--active" : "ai-chat-tab"} onClick={() => setActiveTab("history")} role="tab" aria-selected={activeTab === "history"}>
					History
				</button>
			</div>
				</div>

				<div className="ai-chat-header-actions">
					<label className="ai-chat-field">
						{/* <span>Model</span> */}
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

			

			{activeTab === "chat" ? (
				<>
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
										<div className={message.role === "assistant" ? "ai-chat-markdown" : "ai-chat-bubble-text"}>
											{message.role === "assistant" ? <MarkdownContent content={message.content} /> : message.content}
										</div>
										{message.role === "assistant" && message.id !== messages[0]?.id ? (
											<button
												type="button"
												className="ai-chat-save-button"
												aria-label="Save response"
												disabled={Boolean(savedMessageIds[message.id])}
												onClick={() => saveResponseMessageLegacy(message)}
												title="Save this response"
											>
												{savedMessageIds[message.id] ? "✓" : "💾"}
											</button>
										) : null}
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
				</>
			) : (
				<div className="ai-chat-history-panel">
					<div className="ai-chat-history-header">
						<h3>Saved History</h3>
						<span>{savedHistory.length} item{savedHistory.length === 1 ? "" : "s"}</span>
					</div>

					<div className="ai-chat-history-search-wrap">
						<input
							type="text"
							value={historySearch}
							placeholder="Search by title"
							onChange={(event) => setHistorySearch(event.target.value)}
						/>
					</div>

					{filteredHistory.length === 0 ? (
						<div className="ai-chat-empty-history">No matching saved response.</div>
					) : (
						<>
							<div className="ai-chat-history-list">
								{displayHistory.map((item) => {
									const isExpanded = expandedHistoryId === item.id;
									return (
										<div key={item.id} className="ai-chat-history-item">
											<button
												type="button"
												className="ai-chat-history-title-button"
												onClick={() => toggleHistoryItem(item.id)}
											>
												<span>{item.title}</span>
												<small>{new Date(item.created_at).toLocaleString()}</small>
											</button>
											{isExpanded ? (
												<div className="ai-chat-history-content">
													<MarkdownContent content={item.content} className="ai-chat-markdown" />
												</div>
											) : null}
											<div className="ai-chat-history-actions">
												<button
													type="button"
													className="ai-chat-delete-button"
													onClick={() => openDeleteDialog(item)}
													aria-label="Delete history item"
												>
													🗑️
												</button>
											</div>
										</div>
									);
								})}
							</div>

							<div className="ai-chat-history-pagination">
								<button
									type="button"
									className="ai-chat-pagination-button"
									onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}
									disabled={historyPage === 1}
								>
									&laquo; Previous
								</button>
								<span className="ai-chat-pagination-info">
									Page {historyPage} of {totalPages}
								</span>
								<button
									type="button"
									className="ai-chat-pagination-button"
									onClick={() => setHistoryPage((current) => Math.min(totalPages, current + 1))}
									disabled={historyPage === totalPages}
								>
									Next &raquo;
								</button>
							</div>
						</>
					)}

					
				</div>
			)}

			{saveDialog.open ? (
				<div className="ai-chat-save-dialog">
					<div className="ai-chat-save-dialog-content">
						<h3>Save Response</h3>
						<label>
							<span>Title</span>
							<input
								type="text"
								value={saveDialog.title}
								onChange={(e) => setSaveDialog({ ...saveDialog, title: e.target.value })}
							/>
						</label>
						<label>
							<span>Content</span>
							<textarea
								value={saveDialog.content}
								onChange={(e) => setSaveDialog({ ...saveDialog, content: e.target.value })}
							/>
						</label>
						<div className="ai-chat-save-dialog-actions">
							<button
								type="button"
								className="ai-chat-save-button"
								onClick={saveResponseMessage}
							>
								Save
							</button>
							<button
								type="button"
								className="ai-chat-cancel-button"
								onClick={closeSaveDialog}
							>
								Cancel
							</button>
						</div>
						{error ? <p className="ai-chat-error">{error}</p> : null}
					</div>
				</div>
			) : null}

			{deleteDialog.open ? (
				<div className="ai-chat-delete-dialog">
					<div className="ai-chat-delete-dialog-content">
						<h3>Confirm Deletion</h3>
						<p>Are you sure you want to delete the history item: <strong>{deleteDialog.title}</strong>?</p>
						<div className="ai-chat-delete-dialog-actions">
							<button
								type="button"
								className="ai-chat-delete-confirm-button"
								onClick={deleteHistoryEntry}
							>
								Delete
							</button>
							<button
								type="button"
								className="ai-chat-cancel-button"
								onClick={closeDeleteDialog}
							>
								Cancel
							</button>
						</div>
						{error ? <p className="ai-chat-error">{error}</p> : null}
					</div>
				</div>
			) : null}
		</div>
	);
}