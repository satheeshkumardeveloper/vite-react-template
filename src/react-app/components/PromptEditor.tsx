import { useEffect, useState } from "react";
import "../styles/PromptEditor.css";

type PromptEditorProps = {
	embedded?: boolean;
	filterControlMode?: "select" | "input";
};

const HISTORY_TITLES_API = "/api/prompt-editor/history/titles";
const HISTORY_PROMPTS_API = "/api/prompt-editor/history/prompts";
const POSE_TITLES_API = "/api/prompt-editor/pose/titles";
const POSE_PROMPTS_API = "/api/prompt-editor/pose/prompts";
const HISTORY_JSON_SOURCE_URL = "/saved-history/entries.json";
const POSE_JSON_SOURCE_URL = "/pose-prompt/entries.json";
const ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT?.trim() || "production";
const isLocalMode = ENVIRONMENT === "local";
const AI_PROMPT_MODEL = "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b";
const AI_PROMPT_MODEL_OPTIONS = [
	{ value: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
	{ value: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
	{ value: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
	{ value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
	{ value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
	{ value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
	{ value: "gemini-3.1-pro-preview-customtools", label: "Gemini 3.1 Pro Preview Custom Tools" },
	{ value: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite Preview" },
	{ value: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview" },
	{ value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
	{ value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
	{ value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
	{ value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
	{ value: "@cf/zai-org/glm-4.7-flash", label: "GLM 4.7 Flash" },
	{ value: "@cf/meta/llama-3.2-1b-instruct", label: "Llama 3.2 1B Instruct" },
	{ value: "@cf/meta/llama-3.2-3b-instruct", label: "Llama 3.2 3B Instruct" },
	{ value: "@cf/google/gemma-7b-it-lora", label: "Gemma 7B IT LoRA" },
	{ value: "@cf/mistralai/mistral-small-3.1-24b-instruct", label: "Mistral Small 3.1 24B Instruct" },
	{ value: "@cf/nvidia/nemotron-3-120b-a12b", label: "Nemotron 3 120B A12B" },
	{ value: "@cf/openai/gpt-oss-120b", label: "GPT OSS 120B" },
	{ value: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", label: "DeepSeek R1 Distill Qwen 32B" },
	{ value: "@cf/cloudflare/clef-flash", label: "Clef Flash" },
	{ value: "@cf/qwen/qwen3-30b-a3b-fp8", label: "Qwen 3 30B A3B FP8" },
];

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

const truncateForTable = (value: string, maxLength = 50) => {
	const normalized = String(value || "").replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, maxLength)}...`;
};

export function PromptEditor({ embedded, filterControlMode = "select" }: PromptEditorProps) {
	const useInputControls = filterControlMode === "input";
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
	const [selectedHistoryIndexes, setSelectedHistoryIndexes] = useState<Set<number>>(new Set());
	const [selectedPoseIndexes, setSelectedPoseIndexes] = useState<Set<number>>(new Set());
	const [lastHistoryCheckedIndex, setLastHistoryCheckedIndex] = useState<number | null>(null);
	const [lastPoseCheckedIndex, setLastPoseCheckedIndex] = useState<number | null>(null);
	const [copiedMergedIndexes, setCopiedMergedIndexes] = useState<Set<number>>(new Set());
	const [lastCopiedMergedIndex, setLastCopiedMergedIndex] = useState<number | null>(null);
	const [undoClipboardText, setUndoClipboardText] = useState<string | null>(null);
	const [dynamicPromptColumnCount, setDynamicPromptColumnCount] = useState(3);
	const [extraPromptInputs, setExtraPromptInputs] = useState<string[]>([]);
	const [dynamicRowCountInput, setDynamicRowCountInput] = useState("1");
	const [generatedDynamicRowCount, setGeneratedDynamicRowCount] = useState(1);
	const [generatedPromptRowsByColumn, setGeneratedPromptRowsByColumn] = useState<Record<number, string[]>>({});
	const [generatingPromptIndex, setGeneratingPromptIndex] = useState<number | null>(null);
	const [selectedAiModel, setSelectedAiModel] = useState(AI_PROMPT_MODEL);

	const dynamicPromptIndexes = Array.from({ length: dynamicPromptColumnCount }, (_, index) => index);
	const fallbackDynamicRowCount = Math.max(historyPromptList.length, posePromptList.length, 1);
	const dynamicRowCount = Math.max(generatedDynamicRowCount || fallbackDynamicRowCount, 1);

	const summaryRowCount = Math.max(historyPromptList.length, posePromptList.length);
	const summaryRows = Array.from({ length: summaryRowCount }, (_, index) => {
		const historyValue = historyPromptList[index] || "";
		const poseValue = posePromptList[index] || "";
		return {
			index,
			historyValue,
			poseValue,
		};
	});

	const historySelectableIndexes = summaryRows
		.filter((row) => row.historyValue)
		.map((row) => row.index);

	const poseSelectableIndexes = summaryRows
		.filter((row) => row.poseValue)
		.map((row) => row.index);

	const allHistorySelected =
		historySelectableIndexes.length > 0 &&
		historySelectableIndexes.every((index) => selectedHistoryIndexes.has(index));

	const allPoseSelected =
		poseSelectableIndexes.length > 0 &&
		poseSelectableIndexes.every((index) => selectedPoseIndexes.has(index));

	const fetchJson = async <T,>(url: string): Promise<T> => {
		const res = await fetch(url, { cache: "no-store" });
		const data = (await res.json()) as T & { error?: string };
		if (!res.ok) {
			throw new Error(data?.error || `Request failed (${res.status})`);
		}
		return data as T;
	};

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

	const parsePointRows = (value: string) => {
		const normalized = String(value || "").replace(/\r\n/g, "\n").trim();
		if (!normalized) return [] as string[];

		const numberedMatches = normalized.match(/(?:^|\n)\s*\d+[.)]\s*.+(?=(?:\n\s*\d+[.)]\s*)|$)/g);
		if (numberedMatches && numberedMatches.length > 0) {
			return numberedMatches
				.map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
				.filter(Boolean);
		}

		const bulletMatches = normalized.match(/(?:^|\n)\s*[-*•]\s*.+/g);
		if (bulletMatches && bulletMatches.length > 0) {
			return bulletMatches
				.map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
				.filter(Boolean);
		}

		return normalized
			.split(/\n+/)
			.map((line) => line.trim())
			.filter(Boolean);
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
			if (useInputControls) {
				setHistoryPromptList([]);
				return;
			}

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
	}, [historyCategory, localHistoryRows, useInputControls]);

	useEffect(() => {
		const loadPosePrompts = async () => {
			if (useInputControls) {
				setPosePromptList([]);
				return;
			}

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
	}, [poseCategory, localPoseRows, useInputControls]);

	useEffect(() => {
		setSelectedHistoryPrompt(historyPromptList[0] || "");
	}, [historyPromptList]);

	useEffect(() => {
		setSelectedPosePrompt(posePromptList[0] || "");
	}, [posePromptList]);

	useEffect(() => {
		setSelectedHistoryIndexes(new Set());
		setSelectedPoseIndexes(new Set());
		setLastHistoryCheckedIndex(null);
		setLastPoseCheckedIndex(null);
	}, [historyCategory, poseCategory, historyPromptList, posePromptList]);

	const handleToggleAllHistory = (checked: boolean) => {
		if (!checked) {
			setSelectedHistoryIndexes(new Set());
			return;
		}
		setSelectedHistoryIndexes(new Set(historySelectableIndexes));
	};

	const handleToggleAllPose = (checked: boolean) => {
		if (!checked) {
			setSelectedPoseIndexes(new Set());
			return;
		}
		setSelectedPoseIndexes(new Set(poseSelectableIndexes));
	};

	const handleToggleHistoryRow = (index: number, checked: boolean) => {
		setSelectedHistoryIndexes((prev) => {
			const next = new Set(prev);
			if (checked) next.add(index);
			else next.delete(index);
			return next;
		});
		setLastHistoryCheckedIndex(index);
	};

	const handleTogglePoseRow = (index: number, checked: boolean) => {
		setSelectedPoseIndexes((prev) => {
			const next = new Set(prev);
			if (checked) next.add(index);
			else next.delete(index);
			return next;
		});
		setLastPoseCheckedIndex(index);
	};

	const handleShiftToggleHistoryRow = (index: number, checked: boolean, shiftKey: boolean) => {
		if (!shiftKey || lastHistoryCheckedIndex === null) {
			handleToggleHistoryRow(index, checked);
			return;
		}

		const start = Math.min(lastHistoryCheckedIndex, index);
		const end = Math.max(lastHistoryCheckedIndex, index);

		setSelectedHistoryIndexes((prev) => {
			const next = new Set(prev);
			for (let currentIndex = start; currentIndex <= end; currentIndex += 1) {
				if (!historySelectableIndexes.includes(currentIndex)) continue;
				if (checked) next.add(currentIndex);
				else next.delete(currentIndex);
			}
			return next;
		});
		setLastHistoryCheckedIndex(index);
	};

	const handleShiftTogglePoseRow = (index: number, checked: boolean, shiftKey: boolean) => {
		if (!shiftKey || lastPoseCheckedIndex === null) {
			handleTogglePoseRow(index, checked);
			return;
		}

		const start = Math.min(lastPoseCheckedIndex, index);
		const end = Math.max(lastPoseCheckedIndex, index);

		setSelectedPoseIndexes((prev) => {
			const next = new Set(prev);
			for (let currentIndex = start; currentIndex <= end; currentIndex += 1) {
				if (!poseSelectableIndexes.includes(currentIndex)) continue;
				if (checked) next.add(currentIndex);
				else next.delete(currentIndex);
			}
			return next;
		});
		setLastPoseCheckedIndex(index);
	};

	const handleDeleteSelectedHistory = () => {
		if (selectedHistoryIndexes.size === 0) {
			setStatus("Select history rows to delete.");
			return;
		}

		setHistoryPromptList((prev) => prev.filter((_, index) => !selectedHistoryIndexes.has(index)));
		setSelectedHistoryIndexes(new Set());
		setLastHistoryCheckedIndex(null);
		setStatus("History rows deleted temporarily.");
	};

	const handleDeleteSelectedPose = () => {
		if (selectedPoseIndexes.size === 0) {
			setStatus("Select pose rows to delete.");
			return;
		}

		setPosePromptList((prev) => prev.filter((_, index) => !selectedPoseIndexes.has(index)));
		setSelectedPoseIndexes(new Set());
		setLastPoseCheckedIndex(null);
		setStatus("Pose rows deleted temporarily.");
	};

	const getDynamicPromptInputValue = (index: number) => {
		if (index === 0) return historyCategory;
		if (index === 1) return poseCategory;
		if (index === 2) return additionalText;
		return extraPromptInputs[index - 3] || "";
	};

	const setDynamicPromptInputValue = (index: number, value: string) => {
		if (index === 0) {
			setHistoryCategory(value);
			return;
		}
		if (index === 1) {
			setPoseCategory(value);
			return;
		}
		if (index === 2) {
			setAdditionalText(value);
			return;
		}

		const extraIndex = index - 3;
		setExtraPromptInputs((prev) => {
			const next = [...prev];
			while (next.length <= extraIndex) {
				next.push("");
			}
			next[extraIndex] = value;
			return next;
		});

		setGeneratedPromptRowsByColumn((prev) => {
			if (!prev[index]) return prev;
			const next = { ...prev };
			delete next[index];
			return next;
		});
	};

	const handleClearPromptColumn = (promptIndex: number) => {
		setDynamicPromptInputValue(promptIndex, "");
		setGeneratedPromptRowsByColumn((prev) => {
			if (!prev[promptIndex]) return prev;
			const next = { ...prev };
			delete next[promptIndex];
			return next;
		});
		setStatus(`Prompt ${promptIndex + 1} cleared.`);
	};

	const getDynamicPromptRowValue = (promptIndex: number, rowIndex: number) => {
		const generatedValues = generatedPromptRowsByColumn[promptIndex];
		if (generatedValues && generatedValues.length > 0) {
			return generatedValues[rowIndex] ?? "";
		}

		if (promptIndex === 0) {
			return historyPromptList[rowIndex] ?? historyCategory.trim();
		}
		if (promptIndex === 1) {
			return posePromptList[rowIndex] ?? poseCategory.trim();
		}
		return getDynamicPromptInputValue(promptIndex).trim();
	};

	const handleAddPromptColumn = () => {
		setDynamicPromptColumnCount((prev) => prev + 1);
		setExtraPromptInputs((prev) => [...prev, ""]);
	};

	const handleRemovePromptColumn = () => {
		if (dynamicPromptColumnCount <= 3) {
			return;
		}
		const nextCount = dynamicPromptColumnCount - 1;
		setDynamicPromptColumnCount(nextCount);
		setExtraPromptInputs((prev) => prev.slice(0, Math.max(0, nextCount - 3)));
		setGeneratedPromptRowsByColumn((prev) => {
			const next: Record<number, string[]> = {};
			Object.keys(prev).forEach((key) => {
				const numericKey = Number(key);
				if (numericKey < nextCount) {
					next[numericKey] = prev[numericKey];
				}
			});
			return next;
		});
	};

	const handleGenerateRowsByCount = () => {
		const parsedCount = Number.parseInt(dynamicRowCountInput, 10);
		if (!Number.isFinite(parsedCount) || parsedCount <= 0) {
			setStatus("Enter a valid row count greater than 0.");
			return;
		}
		setGeneratedDynamicRowCount(parsedCount);
		setStatus(`Created ${parsedCount} row${parsedCount > 1 ? "s" : ""}.`);
	};

	const handleGenerateClick = async (promptIndex: number) => {
		const sourcePrompt = getDynamicPromptInputValue(promptIndex).trim();
		if (!sourcePrompt) {
			setStatus(`Enter text in Prompt ${promptIndex + 1} before generating.`);
			return;
		}

		const rowsToGenerate = Math.max(dynamicRowCount, 1);
		setGeneratingPromptIndex(promptIndex);
		setStatus(`Generating Prompt ${promptIndex + 1} with ${selectedAiModel}...`);

		try {
			const response = await fetch("/api/ai-chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: selectedAiModel,
					messages: [
						{
							role: "system",
							content: "You generate concise AI prompt lines. Return only a numbered list with the exact requested count. No preface and no extra explanation.",
						},
						{
							role: "user",
							content: `Create exactly ${rowsToGenerate} prompt lines based on: ${sourcePrompt}. Format strictly as numbered points 1 to ${rowsToGenerate}.`,
						},
					],
				}),
			});

			const data = (await response.json().catch(() => ({}))) as unknown;
			if (!response.ok) {
				const payload = data as { error?: string };
				throw new Error(payload?.error || "AI request failed");
			}

			const aiText = readResponseText(data);
			const parsedPoints = parsePointRows(aiText);
			const filledRows = Array.from({ length: rowsToGenerate }, (_, index) => {
				return (parsedPoints[index] || sourcePrompt).trim();
			});

			setGeneratedPromptRowsByColumn((prev) => ({
				...prev,
				[promptIndex]: filledRows,
			}));
			setStatus(`Prompt ${promptIndex + 1} generated.`);
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "Generation failed.");
		} finally {
			setGeneratingPromptIndex(null);
		}
	};

	const handleMerge = () => {
		if (useInputControls) {
			const mergedRows = Array.from({ length: dynamicRowCount }, (_, rowIndex) => {
				return dynamicPromptIndexes
					.map((promptIndex) => getDynamicPromptRowValue(promptIndex, rowIndex).trim())
					.filter(Boolean)
					.join(" ");
			}).filter(Boolean);

			if (mergedRows.length === 0) {
				setStatus("No prompt content to merge.");
				return;
			}

			setMergedPrompts(mergedRows);
			setStatus("");
			return;
		}

		const historyRows = historyPromptList;
		const poseRows = posePromptList;
		const maxRows = Math.max(historyRows.length, poseRows.length, 1);

		if (maxRows === 0 && !additionalText.trim()) {
			return;
		}

		const mergedRows = Array.from({ length: maxRows }, (_, index) => {
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

	const handleCopyMergedItem = async (value: string, index: number) => {
		if (!value.trim()) {
			setStatus("No merged content to copy.");
			return;
		}

		let previousClipboard: string | null = null;

		try {
			if (navigator.clipboard?.readText) {
				try {
					previousClipboard = await navigator.clipboard.readText();
				} catch {
					previousClipboard = null;
				}
			}

			await navigator.clipboard.writeText(value);
			setUndoClipboardText(previousClipboard);
			setCopiedMergedIndexes((prev) => {
				const next = new Set(prev);
				next.add(index);
				return next;
			});
			setLastCopiedMergedIndex(index);
			setStatus("Merged row copied.");
		} catch {
			setStatus("Clipboard access is blocked by the browser.");
		}
	};

	const handleUndoCopy = async (index: number) => {
		if (!copiedMergedIndexes.has(index)) {
			setStatus("Nothing to undo.");
			return;
		}

		if (lastCopiedMergedIndex === index && undoClipboardText !== null) {
			try {
				await navigator.clipboard.writeText(undoClipboardText);
			} catch {
				setStatus("Undo failed because clipboard access is blocked.");
				return;
			}
		}

		setCopiedMergedIndexes((prev) => {
			const next = new Set(prev);
			next.delete(index);
			return next;
		});
		if (lastCopiedMergedIndex === index) {
			setLastCopiedMergedIndex(null);
			setUndoClipboardText(null);
		}
		setStatus("Copy undone.");
	};

	useEffect(() => {
		setCopiedMergedIndexes(new Set());
		setLastCopiedMergedIndex(null);
		setUndoClipboardText(null);
	}, [mergedPrompts]);

	return (
		<div className={embedded ? "prompt-editor prompt-editor--embedded" : "prompt-editor"}>
			{useInputControls ? (
				<div className="prompt-editor-dynamic-top-controls">
					<div className="prompt-editor-dynamic-count-group">
						<label htmlFor="dynamic-row-count">Count</label>
						<input
							id="dynamic-row-count"
							type="number"
							min={1}
							step={1}
							value={dynamicRowCountInput}
							onChange={(event) => setDynamicRowCountInput(event.target.value)}
						/>
					</div>
					<button
						type="button"
						className="prompt-editor-copy-button"
						onClick={handleGenerateRowsByCount}
					>
						Generate
					</button>
					<div className="prompt-editor-dynamic-count-group">
						<label htmlFor="dynamic-model-select">Model</label>
						<select
							id="dynamic-model-select"
							value={selectedAiModel}
							onChange={(event) => setSelectedAiModel(event.target.value)}
						>
							{AI_PROMPT_MODEL_OPTIONS.map((model) => (
								<option key={model.value} value={model.value}>
									{model.label}
								</option>
							))}
						</select>
					</div>
					<div className="prompt-editor-header-inline-control prompt-editor-dynamic-actions">
						<button
							type="button"
							className="prompt-editor-icon-button"
							onClick={handleAddPromptColumn}
							aria-label="Add prompt column"
							title="Add prompt column"
						>
							+
						</button>
						<button
							type="button"
							className="prompt-editor-icon-button"
							onClick={handleRemovePromptColumn}
							disabled={dynamicPromptColumnCount <= 3}
							aria-label="Remove prompt column"
							title="Remove prompt column"
						>
							−
						</button>
					</div>
					{generatingPromptIndex !== null ? (
						<div className="prompt-editor-generating-indicator" role="status" aria-live="polite">
							<span>Generating Prompt {generatingPromptIndex + 1}</span>
							<span className="prompt-editor-dot-loader" aria-hidden="true">
								<span>.</span>
								<span>.</span>
								<span>.</span>
							</span>
						</div>
					) : null}
				</div>
			) : null}
			<div className="prompt-editor-selection-table-wrap" aria-label="Prompt rows">
				<table className="prompt-editor-selection-table">
					{useInputControls ? (
						<>
							<thead>
								<tr>
									<th>#</th>
									{dynamicPromptIndexes.map((promptIndex) => (
										<th key={`prompt-heading-${promptIndex}`}>{`Prompt ${promptIndex + 1}`}</th>
									))}
								</tr>
								<tr>
									<th className="prompt-editor-control-cell">Filter</th>
									{dynamicPromptIndexes.map((promptIndex) => (
										<th key={`prompt-control-${promptIndex}`} className="prompt-editor-control-cell">
											<div className="prompt-editor-header-inline-control">
												<input
													id={`dynamic-prompt-${promptIndex}`}
													className="prompt-editor-header-control"
													type="text"
													value={getDynamicPromptInputValue(promptIndex)}
													onChange={(event) => setDynamicPromptInputValue(promptIndex, event.target.value)}
													placeholder={`Prompt ${promptIndex + 1}`}
												/>
												<button
													type="button"
													className="prompt-editor-icon-button"
													onClick={() => void handleGenerateClick(promptIndex)}
													disabled={generatingPromptIndex === promptIndex}
													aria-label={`Generate prompt ${promptIndex + 1}`}
													title="Generate"
												>
													{generatingPromptIndex === promptIndex ? (
														<span className="prompt-editor-dot-loader" aria-hidden="true">
															<span>.</span>
															<span>.</span>
															<span>.</span>
														</span>
													) : "⚡"}
												</button>
											</div>
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{Array.from({ length: dynamicRowCount }, (_, rowIndex) => (
									<tr key={`dynamic-row-${rowIndex}`}>
										<td>{rowIndex + 1}</td>
										{dynamicPromptIndexes.map((promptIndex) => {
											const value = getDynamicPromptRowValue(promptIndex, rowIndex).trim();
											return (
												<td key={`dynamic-row-${rowIndex}-prompt-${promptIndex}`} title={value || "-"}>
													{value || "-"}
												</td>
											);
										})}
									</tr>
								))}
							</tbody>
							<tfoot>
								<tr>
									<td className="prompt-editor-control-cell"></td>
									{dynamicPromptIndexes.map((promptIndex) => (
										<td key={`prompt-clear-${promptIndex}`} className="prompt-editor-control-cell">
											<button
												type="button"
												className="prompt-editor-clear-button"
												onClick={() => handleClearPromptColumn(promptIndex)}
												aria-label={`Clear prompt ${promptIndex + 1}`}
												title="Clear"
											>
												🗑
											</button>
										</td>
									))}
								</tr>
							</tfoot>
						</>
					) : (
						<>
							<thead>
								<tr>
									<th>#</th>
									<th>History Prompt</th>
									<th>Pose Prompt</th>
									<th>Additional Text</th>
								</tr>
								<tr>
									<th className="prompt-editor-control-cell">Filter</th>
									<th className="prompt-editor-control-cell">
										<div className="prompt-editor-header-inline-control">
											<input
												type="checkbox"
												className="prompt-editor-small-checkbox"
												checked={allHistorySelected}
												onChange={(event) => handleToggleAllHistory(event.target.checked)}
												disabled={historySelectableIndexes.length === 0}
												aria-label="Select all history rows"
											/>
											<select
												id="history-category"
												className="prompt-editor-header-control"
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
									</th>
									<th className="prompt-editor-control-cell">
										<div className="prompt-editor-header-inline-control">
											<input
												type="checkbox"
												className="prompt-editor-small-checkbox"
												checked={allPoseSelected}
												onChange={(event) => handleToggleAllPose(event.target.checked)}
												disabled={poseSelectableIndexes.length === 0}
												aria-label="Select all pose rows"
											/>
											<select
												id="pose-category"
												className="prompt-editor-header-control"
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
									</th>
									<th className="prompt-editor-control-cell">
										<div className="prompt-editor-header-inline-control">
											<input
												id="additional-text"
												className="prompt-editor-header-control"
												type="text"
												value={additionalText}
												onChange={(event) => setAdditionalText(event.target.value)}
												placeholder=""
											/>
										</div>
									</th>
								</tr>
							</thead>
							<tbody>
								{summaryRows.length === 0 ? (
									<tr>
										<td colSpan={4} className="prompt-editor-empty">No rows</td>
									</tr>
								) : summaryRows.map((row) => {
									return (
									<tr key={`summary-row-${row.index}`}>
										<td>{row.index + 1}</td>
										<td>
											<div className="prompt-editor-row-cell">
												<input
													type="checkbox"
													className="prompt-editor-small-checkbox"
													checked={selectedHistoryIndexes.has(row.index)}
													onChange={(event) =>
														handleShiftToggleHistoryRow(
															row.index,
															event.target.checked,
															Boolean((event.nativeEvent as MouseEvent).shiftKey),
														)
													}
													disabled={!row.historyValue}
													aria-label={`Select history row ${row.index + 1}`}
												/>
												<span className="prompt-editor-table-text" title={row.historyValue || "-"}>
													{row.historyValue ? truncateForTable(row.historyValue) : "-"}
												</span>
											</div>
										</td>
										<td>
											<div className="prompt-editor-row-cell">
												<input
													type="checkbox"
													className="prompt-editor-small-checkbox"
													checked={selectedPoseIndexes.has(row.index)}
													onChange={(event) =>
														handleShiftTogglePoseRow(
															row.index,
															event.target.checked,
															Boolean((event.nativeEvent as MouseEvent).shiftKey),
														)
													}
													disabled={!row.poseValue}
													aria-label={`Select pose row ${row.index + 1}`}
												/>
												<span className="prompt-editor-table-text" title={row.poseValue || "-"}>
													{row.poseValue ? truncateForTable(row.poseValue) : "-"}
												</span>
											</div>
										</td>
										<td title={additionalText.trim() || "-"}>{additionalText.trim() ? truncateForTable(additionalText.trim()) : "-"}</td>
									</tr>
									);
								})}
							</tbody>
						</>
					)}
				</table>
			</div>

			<div className="prompt-editor-action-row">
				{!useInputControls ? (
					<>
						<button
							type="button"
							className="prompt-editor-delete-button"
							onClick={handleDeleteSelectedHistory}
							disabled={selectedHistoryIndexes.size === 0}
						>
							Delete History Temp
						</button>
						<button
							type="button"
							className="prompt-editor-delete-button"
							onClick={handleDeleteSelectedPose}
							disabled={selectedPoseIndexes.size === 0}
						>
							Delete Pose Temp
						</button>
					</>
				) : null}
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
						<div
							key={`${result}-${index}`}
							className={copiedMergedIndexes.has(index) ? "prompt-editor-result-item prompt-editor-result-item--copied" : "prompt-editor-result-item"}
						>
							<span className="prompt-editor-result-text" title={result}>{result}</span>
							<div className="prompt-editor-result-actions">
								<button
									type="button"
									className="prompt-editor-icon-button"
									onClick={() => handleCopyMergedItem(result, index)}
									aria-label={`Copy merged row ${index + 1}`}
									title="Copy"
								>
									⎘
								</button>
								{copiedMergedIndexes.has(index) ? (
									<button
										type="button"
										className="prompt-editor-undo-button"
										onClick={() => handleUndoCopy(index)}
									>
										Undo
									</button>
								) : null}
							</div>
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