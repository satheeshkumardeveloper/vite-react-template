import { useEffect, useMemo, useState } from "react";
import "../styles/PromptEditor.css";

type PromptEditorProps = {
	embedded?: boolean;
};

const ADDITIONAL_TEXT_OPTIONS = [
	"",
];

const HISTORY_TITLES_API = "/api/prompt-editor/history/titles";
const HISTORY_PROMPTS_API = "/api/prompt-editor/history/prompts";
const POSE_TITLES_API = "/api/prompt-editor/pose/titles";
const POSE_PROMPTS_API = "/api/prompt-editor/pose/prompts";
const HISTORY_JSON_SOURCE_URL = "/saved-history/entries.json";
const POSE_JSON_SOURCE_URL = "/pose-prompt/entries.json";
const ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT?.trim() || "production";
const isLocalMode = ENVIRONMENT === "local";

type TitlesResponse = {
	titles?: string[];
	error?: string;
};

type PromptsResponse = {
	prompts?: string[];
	error?: string;
};

type LocalPromptRow = {
	id?: number;
	title?: string | null;
	content?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
};

const parseCompletedSentences = (value: string) => {
	const normalized = value.replace(/\r\n/g, "\n").trim();
	if (!normalized) return [] as string[];

	const indexedPattern = /(?:^|\n)\s*\d+\.\s*[\s\S]*?(?=(?:\n\s*\d+\.\s)|$)/g;
	const indexedMatches = normalized.match(indexedPattern);
	if (indexedMatches && indexedMatches.length > 0) {
		return indexedMatches
			.map((block) => block.replace(/^\s*\d+\.\s*/, "").trim())
			.filter(Boolean);
	}

	const lineBlocks = normalized
		.split(/\n+/)
		.map((line) => line.trim())
		.filter(Boolean);

	const sentenceBlocks = lineBlocks.flatMap((line) => {
		const matches = line.match(/[^.!?]+[.!?]+(?:["')\]]+)?/g);
		if (matches && matches.length > 0) {
			return matches.map((sentence) => sentence.trim()).filter(Boolean);
		}
		return [line];
	});

	return sentenceBlocks;
};

export function PromptEditor({ embedded }: PromptEditorProps) {
	const [historyCategories, setHistoryCategories] = useState<string[]>([]);
	const [poseCategories, setPoseCategories] = useState<string[]>([]);
	const [historyCategory, setHistoryCategory] = useState("");
	const [poseCategory, setPoseCategory] = useState("");
	const [historyPromptList, setHistoryPromptList] = useState<string[]>([]);
	const [posePromptList, setPosePromptList] = useState<string[]>([]);
	const [selectedHistoryPrompt, setSelectedHistoryPrompt] = useState("");
	const [selectedPosePrompt, setSelectedPosePrompt] = useState("");
	const [additionalText, setAdditionalText] = useState("");
	const [mergedPrompts, setMergedPrompts] = useState<string[]>([]);
	const [status, setStatus] = useState("");
	const [localHistoryRows, setLocalHistoryRows] = useState<LocalPromptRow[]>([]);
	const [localPoseRows, setLocalPoseRows] = useState<LocalPromptRow[]>([]);

	const uniqueAdditionalOptions = useMemo(
		() => Array.from(new Set(ADDITIONAL_TEXT_OPTIONS)),
		[],
	);

	const fetchJson = async <T,>(url: string): Promise<T> => {
		const res = await fetch(url, { cache: "no-store" });
		const data = (await res.json()) as T & { error?: string };
		if (!res.ok) {
			throw new Error(data?.error || `Request failed (${res.status})`);
		}
		return data as T;
	};

	useEffect(() => {
		const loadTitles = async () => {
			setStatus("Loading...");
			try {
				if (isLocalMode) {
					const [historyRows, poseRows] = await Promise.all([
						fetchJson<LocalPromptRow[]>(HISTORY_JSON_SOURCE_URL),
						fetchJson<LocalPromptRow[]>(POSE_JSON_SOURCE_URL),
					]);

					const historyList = Array.isArray(historyRows) ? historyRows : [];
					const poseList = Array.isArray(poseRows) ? poseRows : [];

					setLocalHistoryRows(historyList);
					setLocalPoseRows(poseList);

					const nextHistoryCategories = Array.from(
						new Set(
							historyList
								.map((row) => String(row.title || "").trim())
								.filter(Boolean),
						),
					).sort((a, b) => a.localeCompare(b));

					const nextPoseCategories = Array.from(
						new Set(
							poseList
								.map((row) => String(row.title || "").trim())
								.filter(Boolean),
						),
					).sort((a, b) => a.localeCompare(b));

					setHistoryCategories(nextHistoryCategories);
					setPoseCategories(nextPoseCategories);
					setHistoryCategory("");
					setPoseCategory("");
					setStatus("");
					return;
				}

				const [historyData, poseData] = await Promise.all([
					fetchJson<TitlesResponse>(HISTORY_TITLES_API),
					fetchJson<TitlesResponse>(POSE_TITLES_API),
				]);

				const nextHistoryCategories = Array.isArray(historyData.titles) ? historyData.titles : [];
				const nextPoseCategories = Array.isArray(poseData.titles) ? poseData.titles : [];

				setHistoryCategories(nextHistoryCategories);
				setPoseCategories(nextPoseCategories);
				setHistoryCategory("");
				setPoseCategory("");
				setStatus("");
			} catch (error) {
				setStatus(error instanceof Error ? error.message : String(error));
			}
		};

		loadTitles();
	}, []);

	useEffect(() => {
		const loadHistoryPrompts = async () => {
			if (!historyCategory) {
				setHistoryPromptList([]);
				return;
			}

			if (isLocalMode) {
				const filteredPrompts = localHistoryRows
					.filter((row) => String(row.title || "").trim() === historyCategory)
					.sort((a, b) => {
						const aTime = new Date(a.created_at || "").getTime() || 0;
						const bTime = new Date(b.created_at || "").getTime() || 0;
						if (bTime !== aTime) return bTime - aTime;
						return (Number(b.id) || 0) - (Number(a.id) || 0);
					})
					.map((row) => String(row.content || "").trim())
					.filter(Boolean);

				setHistoryPromptList(filteredPrompts);
				return;
			}

			try {
				const data = await fetchJson<PromptsResponse>(`${HISTORY_PROMPTS_API}?title=${encodeURIComponent(historyCategory)}`);
				setHistoryPromptList(Array.isArray(data.prompts) ? data.prompts : []);
			} catch (error) {
				setHistoryPromptList([]);
				setStatus(error instanceof Error ? error.message : String(error));
			}
		};

		loadHistoryPrompts();
	}, [historyCategory, localHistoryRows]);

	useEffect(() => {
		const loadPosePrompts = async () => {
			if (!poseCategory) {
				setPosePromptList([]);
				return;
			}

			if (isLocalMode) {
				const filteredPrompts = localPoseRows
					.filter((row) => String(row.title || "").trim() === poseCategory)
					.sort((a, b) => {
						const aTime = new Date(a.updated_at || a.created_at || "").getTime() || 0;
						const bTime = new Date(b.updated_at || b.created_at || "").getTime() || 0;
						if (bTime !== aTime) return bTime - aTime;
						return (Number(b.id) || 0) - (Number(a.id) || 0);
					})
					.flatMap((row) => parseCompletedSentences(String(row.content || "")));

				setPosePromptList(filteredPrompts);
				return;
			}

			try {
				const data = await fetchJson<PromptsResponse>(`${POSE_PROMPTS_API}?title=${encodeURIComponent(poseCategory)}`);
				const posePrompts = Array.isArray(data.prompts)
					? data.prompts.flatMap((prompt) => parseCompletedSentences(String(prompt || "")))
					: [];
				setPosePromptList(posePrompts);
			} catch (error) {
				setPosePromptList([]);
				setStatus(error instanceof Error ? error.message : String(error));
			}
		};

		loadPosePrompts();
	}, [poseCategory, localPoseRows]);

	useEffect(() => {
		setSelectedHistoryPrompt(historyPromptList[0] || "");
	}, [historyPromptList]);

	useEffect(() => {
		setSelectedPosePrompt(posePromptList[0] || "");
	}, [posePromptList]);

	const handleMerge = () => {
		const historyRows = historyPromptList.length > 0 ? historyPromptList : [selectedHistoryPrompt].filter(Boolean);
		const poseRows = posePromptList.length > 0 ? posePromptList : [selectedPosePrompt].filter(Boolean);
		const maxRows = Math.max(historyRows.length, poseRows.length);

		if (maxRows === 0 && !additionalText.trim()) {
			return;
		}

		const mergedRows = Array.from({ length: Math.max(1, maxRows) }, (_, index) => {
			const historyRow = historyRows[index] ?? selectedHistoryPrompt ?? "";
			const poseRow = poseRows[index] ?? selectedPosePrompt ?? "";
			return [historyRow, poseRow, additionalText.trim()].filter(Boolean).join(" ");
		}).filter(Boolean);

		if (mergedRows.length === 0) {
			return;
		}

		setMergedPrompts(mergedRows);
		setStatus("");
	};

	const handleCopyMerged = async () => {
		if (mergedPrompts.length === 0) {
			setStatus("No merged content to copy.");
			return;
		}

		try {
			await navigator.clipboard.writeText(mergedPrompts.join("\n"));
			setStatus("Merged content copied.");
		} catch {
			setStatus("Clipboard access is blocked by the browser.");
		}
	};

	return (
		<div className={embedded ? "prompt-editor prompt-editor--embedded" : "prompt-editor"}>
			<div className="prompt-editor-top-row">
				<div className="prompt-editor-field">
					<label htmlFor="history-category">History prompt category</label>
					<select
						id="history-category"
						value={historyCategory}
						onChange={(event) => setHistoryCategory(event.target.value)}
						disabled={historyCategories.length === 0}
					>
						{historyCategories.length === 0 ? (
							<option value="">No history titles</option>
						) : (
							<>
								<option value="">Select</option>
								{historyCategories.map((category) => (
									<option key={category} value={category}>
										{category}
									</option>
								))}
							</>
						)}
					</select>
				</div>

				<div className="prompt-editor-field">
					<label htmlFor="pose-category">Pose Title</label>
					<select
						id="pose-category"
						value={poseCategory}
						onChange={(event) => setPoseCategory(event.target.value)}
						disabled={poseCategories.length === 0}
					>
						{poseCategories.length === 0 ? (
							<option value="">No pose titles</option>
						) : (
							<>
								<option value="">Select</option>
								{poseCategories.map((category) => (
									<option key={category} value={category}>
										{category}
									</option>
								))}
							</>
						)}
					</select>
				</div>

				<div className="prompt-editor-field prompt-editor-field--wide">
					<label htmlFor="additional-text">Additional text</label>
					<input
						id="additional-text"
						type="text"
						value={additionalText}
						onChange={(event) => setAdditionalText(event.target.value)}
						placeholder=""
					/>
				</div>
			</div>

			<div className="prompt-editor-lists-row">
				<div className="prompt-editor-list" role="listbox" aria-label="History prompts">
					{historyPromptList.length === 0 ? (
						<div className="prompt-editor-empty">No history prompts</div>
					) : historyPromptList.map((prompt, index) => (
						<button
							key={`${prompt}-${index}`}
							type="button"
							className={prompt === selectedHistoryPrompt ? "prompt-editor-item prompt-editor-item--active" : "prompt-editor-item"}
							onClick={() => setSelectedHistoryPrompt(prompt)}
						>
							{`${index + 1}. ${prompt}`}
						</button>
					))}
				</div>

				<div className="prompt-editor-list" role="listbox" aria-label="Pose prompts">
					{posePromptList.length === 0 ? (
						<div className="prompt-editor-empty">No pose prompts</div>
					) : posePromptList.map((prompt, index) => (
						<button
							key={`${prompt}-${index}`}
							type="button"
							className={prompt === selectedPosePrompt ? "prompt-editor-item prompt-editor-item--active" : "prompt-editor-item"}
							onClick={() => setSelectedPosePrompt(prompt)}
						>
							{`${index + 1}. ${prompt}`}
						</button>
					))}
				</div>

				<div className="prompt-editor-list" role="listbox" aria-label="Additional text options">
					{uniqueAdditionalOptions.map((option, index) => (
						<button
							key={`${option}-${index}`}
							type="button"
							className={option === additionalText ? "prompt-editor-item prompt-editor-item--active" : "prompt-editor-item"}
							onClick={() => setAdditionalText(option)}
						>
							{option}
						</button>
					))}
				</div>
			</div>

			<div className="prompt-editor-merge-row">
				<button type="button" className="prompt-editor-merge-button" onClick={handleMerge}>
					Merge
				</button>
			</div>

			{status ? <div className="prompt-editor-status">{status}</div> : null}

			<div className="prompt-editor-result-list" role="listbox" aria-label="Merged prompts">
				{mergedPrompts.length === 0 ? (
					<div className="prompt-editor-empty">Prompt1 + Prompt2 + additional text</div>
				) : (
					mergedPrompts.map((result, index) => (
						<div key={`${result}-${index}`} className="prompt-editor-result-item">
							{result}
						</div>
					))
				)}
			</div>

			<div className="prompt-editor-copy-row">
				<button
					type="button"
					className="prompt-editor-copy-button"
					onClick={handleCopyMerged}
					disabled={mergedPrompts.length === 0}
				>
					Copy Merged
				</button>
			</div>
		</div>
	);
}