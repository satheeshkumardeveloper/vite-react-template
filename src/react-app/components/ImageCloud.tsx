import { useEffect, useMemo, useState, type ClipboardEvent } from "react";
import "../styles/ImagePrompt.css";

type BatchResult = {
	fileIndex: number;
	fileName: string;
	status: "pending" | "processing" | "done" | "error";
	result: string;
	error?: string;
};

type UsageRecord = {
	date: string;
	requests: number;
	lastImages: number | null;
	lastSeconds: number | null;
};

const USAGE_STORAGE_KEY = "cloudflareImageCloudUsage";
const PRIVATE_MODE_STORAGE_KEY = "cloudflareImageCloudPrivateMode";
const MODEL_OPTIONS = [
	"@cf/meta/llama-4-scout-17b-16e-instruct",
	"@cf/meta/llama-3.2-11b-vision-instruct",
	"@cf/mistralai/mistral-small-3.1-24b-instruct",
] as const;

const ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT?.trim() || "production";

const INSTRUCTION_SOURCE_URL = ENVIRONMENT === "local" 
	? "/instructions/image-cloud/instructions.json"
	: "/api/prompt-instruction";

type InstructionPreset = {
	value: string;
	label: string;
	text: (focusText: string) => string;
};

type InstructionPresetRecord = {
	value: string;
	label: string;
	textTemplate?: string;
	textTemplateLines?: string[];
};

function applyFocusTemplate(template: string, focusText: string) {
	return template.split("{{focus}}").join(focusText).split("${focus}").join(focusText).trim();
}

function toInstructionPreset(record: InstructionPresetRecord): InstructionPreset {
	const template = record.textTemplate ?? record.textTemplateLines?.join("\n") ?? "";
	return {
		value: record.value,
		label: record.label,
		text: (focusText: string) => applyFocusTemplate(template, focusText),
	};
}

async function loadInstructionPresets(sourceUrl: string) {
	console.log("loadInstructionPresets: Fetching from", sourceUrl);
	const response = await fetch(sourceUrl, { cache: "no-store" });
	console.log("loadInstructionPresets: Response status", response.status);
	
	if (!response.ok) {
		throw new Error(`Failed to fetch instructions from ${sourceUrl}: ${response.status} ${response.statusText}`);
	}

	const records = await readResponseJson(response);
	console.log("loadInstructionPresets: Parsed records", records);
	
	if (records?.error) {
		throw new Error(records.error.message || "Failed to parse instructions file");
	}

	const list = Array.isArray(records) ? records : Array.isArray(records?.instructions) ? records.instructions : [];
	console.log("loadInstructionPresets: Extracted list", list);
	
	if (!list.length) {
		throw new Error("Instruction file did not contain any presets.");
	}

	return list.map((record: Partial<InstructionPresetRecord>) => {
		const template = record.textTemplate ?? record.textTemplateLines?.join("\n") ?? "";
		if (!record.value || !record.label || !template) {
			throw new Error(`Invalid preset: missing value, label, or template. Got: ${JSON.stringify(record)}`);
		}

		return toInstructionPreset({
			value: record.value,
			label: record.label,
			textTemplate: template,
		});
	});
}

async function loadInstructionsFromDatabase() {
	const response = await fetch("/api/prompt-instruction", { cache: "no-store" });
	const records = await readResponseJson(response);

	if (!response.ok) {
		throw new Error(records?.error || "Failed to load instructions from database");
	}

	const list = Array.isArray(records) ? records : [];
	if (!list.length) {
		throw new Error("No instructions found in database.");
	}

	return list.map((record: any) => {
		const { value, label, prompt_instruction } = record;
		if (!value || !label || !prompt_instruction) {
			throw new Error("Database instruction record is missing required fields.");
		}

		return toInstructionPreset({
			value,
			label,
			textTemplate: prompt_instruction,
		});
	});
}

function loadUsage(): UsageRecord {
	const today = new Date().toISOString().slice(0, 10);
	const saved = JSON.parse(localStorage.getItem(USAGE_STORAGE_KEY) || "null") as UsageRecord | null;
	if (!saved || saved.date !== today) {
		return { date: today, requests: 0, lastImages: null, lastSeconds: null };
	}
	return saved;
}

function fileToDataUrl(file: File) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ""));
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

async function readResponseJson(response: Response) {
	try {
		const text = await response.text();
		console.log("Response text:", text.substring(0, 100));
		return JSON.parse(text);
	} catch (err) {
		console.error("Failed to parse response as JSON:", err);
		return { error: { message: String(err) } };
	}
}

async function loadCategorySuggestions() {
	const response = await fetch("/api/image-prompts");
	const records = await readResponseJson(response);

	if (!response.ok) {
		throw new Error(records?.error || "Failed to load saved prompts");
	}

	const categories = [...new Set(
		(Array.isArray(records) ? records : [])
			.map((record: { category?: string }) => record.category?.trim())
			.filter((category): category is string => Boolean(category)),
	)].sort((first, second) => first.localeCompare(second));

	return categories;
}

async function saveGeneratedPrompt(prompt: string, category: string, images: File[]) {
	const form = new FormData();
	form.append("prompt", prompt);
	form.append("category", category.trim());
	images.forEach((file) => form.append("images", file, file.name));

	const response = await fetch("/api/image-prompts", {
		method: "POST",
		body: form,
	});
	const data = await readResponseJson(response);

	if (!response.ok) {
		throw new Error(data?.error || "Failed to save prompt");
	}

	return data;
}

export function ImageCloud({ onBackToDashboard, embedded = false }: { onBackToDashboard?: () => void; embedded?: boolean }) {
	const [usage, setUsage] = useState<UsageRecord>(() => loadUsage());
	const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
	const [previewUrls, setPreviewUrls] = useState<string[]>([]);
	const [imagePreviewsVisible, setImagePreviewsVisible] = useState(false);
	const [privateMode, setPrivateMode] = useState(() => localStorage.getItem(PRIVATE_MODE_STORAGE_KEY) === "true");
	const [category, setCategory] = useState("Prompt");
	const [categorySuggestions, setCategorySuggestions] = useState<string[]>([]);
	const [model, setModel] = useState<(typeof MODEL_OPTIONS)[number]>(MODEL_OPTIONS[1]);
	const [instruction, setInstruction] = useState("");
	const [result, setResult] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [progressValue, setProgressValue] = useState(0);
	const [progressMessage, setProgressMessage] = useState("Preparing request...");
	const [copyLabel, setCopyLabel] = useState("Copy");
	const [batchMode, setBatchMode] = useState(false);
	const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
	const [batchProcessing, setBatchProcessing] = useState(false);
	const [isDragging, setIsDragging] = useState(false);

	const [instructionPresets, setInstructionPresets] = useState<InstructionPreset[]>([]);

	const generatedPromptText = useMemo(() => {
		const selectedPreset = instructionPresets.find((p) => p.value === instruction) || instructionPresets[0];
		return selectedPreset ? selectedPreset.text("") : "";
	}, [instruction, instructionPresets]);

	useEffect(() => {
		loadCategorySuggestions()
			.then((categories) => setCategorySuggestions(categories))
			.catch((loadError) => {
				console.error("Failed to load category suggestions:", loadError);
			});
	}, []);

	useEffect(() => {
		const urls = selectedFiles.map((file) => URL.createObjectURL(file));
		setPreviewUrls(urls);
		if (!selectedFiles.length) {
			setImagePreviewsVisible(false);
		}
		return () => {
			urls.forEach((url) => URL.revokeObjectURL(url));
		};
	}, [selectedFiles]);

	useEffect(() => {
		localStorage.setItem(PRIVATE_MODE_STORAGE_KEY, String(privateMode));
	}, [privateMode]);

	useEffect(() => {
		localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(usage));
	}, [usage]);

	useEffect(() => {
		async function loadPresets() {
			try {
				console.log("ENVIRONMENT:", ENVIRONMENT);
				console.log("INSTRUCTION_SOURCE_URL:", INSTRUCTION_SOURCE_URL);

				const presets = ENVIRONMENT === "local"
					? await loadInstructionPresets(INSTRUCTION_SOURCE_URL)
					: await loadInstructionsFromDatabase();

				console.log("Loaded presets:", presets);
				setInstructionPresets(presets);
				if (presets.length > 0) {
					console.log("Setting first instruction:", presets[0].value);
					setInstruction(presets[0].value);
				}
			} catch (error) {
				console.error("Error loading instruction presets:", error);
				setInstructionPresets([]);
			}
		}

		loadPresets();
	}, [INSTRUCTION_SOURCE_URL]);

	const startProgress = () => {
		const startedAt = Date.now();
		setProgressValue(5);
		setProgressMessage("Preparing request...");
		const timer = window.setInterval(() => {
			const elapsed = (Date.now() - startedAt) / 1000;
			setProgressValue(Math.min(92, 15 + elapsed * 8));
			setProgressMessage(`Analyzing image... ${elapsed.toFixed(1)}s`);
		}, 250);
		return timer;
	};

	const stopProgress = (timer: number | undefined, success: boolean) => {
		if (timer) {
			window.clearInterval(timer);
		}
		setProgressValue(success ? 100 : 0);
		setProgressMessage(success ? "Complete" : "Request stopped");
	};

	const copyPrompt = async () => {
		if (!result) {
			return;
		}
		try {
			await navigator.clipboard.writeText(result);
		} catch {
			const textarea = document.getElementById("image-cloud-result") as HTMLTextAreaElement | null;
			if (textarea) {
				textarea.focus();
				textarea.select();
				document.execCommand("copy");
				textarea.setSelectionRange(textarea.value.length, textarea.value.length);
			}
		}
		setCopyLabel("Copied");
		window.setTimeout(() => setCopyLabel("Copy"), 1600);
	};

	const processBatchItem = async (index: number) => {
		const file = selectedFiles[index];
		if (!file) {
			throw new Error("Selected image not found.");
		}

		setBatchResults((current) =>
			current.map((r) =>
				r.fileIndex === index ? { ...r, status: "processing" as const, error: undefined } : r,
			),
		);

		const dataUrl = await fileToDataUrl(file);
		const response = await fetch("/api/image-prompt-vision", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model,
				promptText: `${generatedPromptText} ${category.trim() ? `Category: ${category.trim()}.` : ""}`,
				images: [{ dataUrl }],
			}),
		});

		const data = await readResponseJson(response);
		if (!response.ok) {
			throw new Error(data?.error || "Cloudflare vision request failed");
		}

		const reply = typeof data?.reply === "string" ? data.reply.trim() : "";
		if (!reply) {
			throw new Error("No prompt returned");
		}

		setBatchResults((current) =>
			current.map((r) =>
				r.fileIndex === index ? { ...r, status: "done" as const, result: reply, error: undefined } : r,
			),
		);

		if (!privateMode) {
			await saveGeneratedPrompt(reply, category, [file]);
		}

		return reply;
	};

	const handleBatchProcess = async () => {
		if (!selectedFiles.length) {
			setError("Please select at least one image.");
			return;
		}

		setError("");
		setBatchResults(
			selectedFiles.map((file, idx) => ({
				fileIndex: idx,
				fileName: file.name,
				status: "pending" as const,
				result: "",
			})),
		);
		setBatchProcessing(true);

		for (let i = 0; i < selectedFiles.length; i++) {
			try {
				await processBatchItem(i);

				if (i < selectedFiles.length - 1) {
					await new Promise((resolve) => setTimeout(resolve, 2000));
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : "Unknown error";
				setBatchResults((current) =>
					current.map((r) =>
						r.fileIndex === i
							? { ...r, status: "error" as const, error: message }
							: r,
					),
				);
			}
		}

		setBatchProcessing(false);
		if (!privateMode) {
			try {
				setCategorySuggestions(await loadCategorySuggestions());
			} catch {
				console.error("Failed to refresh categories");
			}
		}
	};

	const handleRetryBatchItem = async (fileIndex: number) => {
		try {
			setError("");
			await processBatchItem(fileIndex);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setBatchResults((current) =>
				current.map((r) =>
					r.fileIndex === fileIndex ? { ...r, status: "error" as const, error: message } : r,
				),
			);
		}
	};

	const handleGenerate = async () => {
		if (!selectedFiles.length) {
			setError("Please select at least one image.");
			return;
		}

		const startedAt = Date.now();
		setLoading(true);
		setError("");
		setResult("");
		const timer = startProgress();

		try {
			const images = await Promise.all(
				selectedFiles.map(async (file) => ({
					dataUrl: await fileToDataUrl(file),
				})),
			);

			const response = await fetch("/api/image-prompt-vision", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model,
					promptText: `${generatedPromptText} ${category.trim() ? `Category: ${category.trim()}.` : ""}`,
					images,
				}),
			});

			const data = await readResponseJson(response);
			if (!response.ok) {
				throw new Error(data?.error || "Cloudflare vision request failed");
			}

			const reply = typeof data?.reply === "string" ? data.reply.trim() : "";
			if (!reply) {
				throw new Error("No prompt was returned by Cloudflare.");
			}

			setResult(reply);
			stopProgress(timer, true);

			if (!privateMode) {
				await saveGeneratedPrompt(reply, category, selectedFiles);
				try {
					setCategorySuggestions(await loadCategorySuggestions());
				} catch (loadError) {
					console.error("Failed to refresh category suggestions:", loadError);
				}
			}

			setUsage((current) => ({
				...current,
				requests: current.requests + 1,
				lastImages: selectedFiles.length,
				lastSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
			}));
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setError(message === "Request stopped" ? "Request stopped." : message);
			stopProgress(timer, false);
		} finally {
			setLoading(false);
		}
	};

	const handlePasteImages = async () => {
		if (!navigator.clipboard?.read) {
			setError("Clipboard image access is not supported by this browser.");
			return;
		}

		setError("");
		try {
			const clipboardItems = await navigator.clipboard.read();
			const pastedImages: File[] = [];

			for (const clipboardItem of clipboardItems) {
				const imageType = clipboardItem.types.find((type) => type.startsWith("image/"));
				if (!imageType) {
					continue;
				}

				const blob = await clipboardItem.getType(imageType);
				pastedImages.push(
					new File(
						[blob],
						`clipboard-image-${Date.now()}-${pastedImages.length}.${imageType.split("/")[1] || "png"}`,
						{ type: imageType },
					),
				);
			}

			if (!pastedImages.length) {
				setError("No image found in the clipboard.");
				return;
			}

			setSelectedFiles((current) => [...current, ...pastedImages]);
			setImagePreviewsVisible(false);
			setError(`${pastedImages.length} image${pastedImages.length === 1 ? "" : "s"} pasted from clipboard.`);
		} catch (clipboardError) {
			const errorName = clipboardError instanceof DOMException ? clipboardError.name : "";
			setError(errorName === "NotAllowedError" ? "Clipboard permission was denied." : "Failed to paste image from clipboard.");
		}
	};

	const imageCountLabel = useMemo(() => `${selectedFiles.length} image${selectedFiles.length === 1 ? "" : "s"} selected`, [selectedFiles.length]);

	const handleFiles = (files: FileList | File[] | null) => {
		const incoming = Array.from(files || []);
		const filtered = incoming.filter((file) => file.type.startsWith("image/"));
		setSelectedFiles(filtered);
		setImagePreviewsVisible(true);
		setError("");
	};

	const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
		event.preventDefault();
		event.stopPropagation();
		setIsDragging(true);
	};

	const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
		event.preventDefault();
		event.stopPropagation();
		setIsDragging(false);
	};

	const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
		event.preventDefault();
		event.stopPropagation();
		setIsDragging(false);
		const files = event.dataTransfer?.files;
		if (files) {
			handleFiles(files);
		}
	};

	const onPasteFromKeyboard = (event: ClipboardEvent<HTMLDivElement>) => {
		const items = Array.from(event.clipboardData?.items || []);
		const pastedImages = items
			.filter((item) => item.type.startsWith("image/"))
			.map((item) => item.getAsFile())
			.filter((file): file is File => Boolean(file));

		if (!pastedImages.length) {
			return;
		}

		event.preventDefault();
		setSelectedFiles((current) => [...current, ...pastedImages]);
		setImagePreviewsVisible(false);
		setError(`${pastedImages.length} image${pastedImages.length === 1 ? "" : "s"} pasted from clipboard.`);
	};

	const actionIconStyle = { width: 16, height: 16, display: "block" };

	function PasteIcon() {
		return (
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={actionIconStyle} aria-hidden="true">
				<path d="M9 9.5V7.8A2.8 2.8 0 0 1 11.8 5h.4A2.8 2.8 0 0 1 15 7.8v1.7" />
				<rect x="7" y="9" width="10" height="10" rx="2.2" />
				<path d="M12 13v3" />
				<path d="M10.5 14.5 12 13l1.5 1.5" />
			</svg>
		);
	}

	function EyeIcon() {
		return (
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={actionIconStyle} aria-hidden="true">
				<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
				<circle cx="12" cy="12" r="3" />
			</svg>
		);
	}

	function TrashIcon() {
		return (
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={actionIconStyle} aria-hidden="true">
				<path d="M4 7h16" />
				<path d="M10 11v6" />
				<path d="M14 11v6" />
				<path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
				<path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
			</svg>
		);
	}

	return (
		<div className={embedded ? "image-prompt-page embedded" : "image-prompt-page"}>
			<div className={embedded ? "image-prompt-shell embedded" : "image-prompt-shell"}>
				<div className="page-header">
					<div>
						{/* <h1>Image Cloud</h1> */}
					</div>
					{!embedded ? (
						<button type="button" className="back-button" onClick={onBackToDashboard}>
							Back to dashboard
						</button>
					) : null}
				</div>

<div className="workspace" onPaste={(e: React.ClipboardEvent) => {
				const items = Array.from(e.clipboardData?.items || []);
				const pastedImages = items
					.filter((item) => (item as DataTransferItem).type.startsWith("image/"))
					.map((item) => (item as DataTransferItem).getAsFile())
						.filter((file): file is File => Boolean(file));

					if (!pastedImages.length) {
						return;
					}

					e.preventDefault();
					setSelectedFiles((current) => [...current, ...pastedImages]);
					setImagePreviewsVisible(false);
					setError(`${pastedImages.length} image${pastedImages.length === 1 ? "" : "s"} pasted from clipboard.`);
				}}>
					<section className="panel">
						<h2>Reference image</h2>
<label 
						className="dropzone" 
						htmlFor="imageInput" 
						onDragOver={handleDragOver}
						onDragEnter={handleDragOver}
						onDragLeave={handleDragLeave}
						onDrop={handleDrop}
						style={{
							borderColor: isDragging ? "#78e6c0" : undefined,
							backgroundColor: isDragging ? "rgba(120, 230, 192, 0.1)" : undefined,
							transition: "all 0.2s ease",
						}}
					>
						<span>
							<strong>{isDragging ? "Drop images here" : "Choose an image"}</strong>
							{isDragging ? "Release to upload" : "Click to browse, drag-and-drop, or paste from clipboard"}
							</span>
							<input id="imageInput" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => handleFiles(event.currentTarget.files)} />
						</label>

						<div className="image-controls">
							<span id="imageCount" aria-live="polite">{imageCountLabel}</span>
							<div className="image-actions">
								<button type="button" onClick={handlePasteImages} aria-label="Paste image" title="Paste image">
									<PasteIcon />
								</button>
								<button type="button" onClick={() => handleFiles([])} disabled={!selectedFiles.length} aria-label="Clear images" title="Clear images">
									<TrashIcon />
								</button>
								<button type="button" onClick={() => setImagePreviewsVisible((current) => !current)} disabled={!selectedFiles.length} aria-label={imagePreviewsVisible ? "Hide images" : "Show images"} title={imagePreviewsVisible ? "Hide images" : "Show images"}>
									<EyeIcon />
								</button>
							</div>
						</div>

						<div className="preview-grid" hidden={!selectedFiles.length || !imagePreviewsVisible}>
							{previewUrls.map((url, index) => (
								<img key={`${selectedFiles[index]?.name}-${index}`} src={url} alt={`Selected image ${index + 1}`} />
							))}
						</div>

						<label className="field-label" htmlFor="category">Category</label>
						<input id="category" type="text" list="categorySuggestions" value={category} onChange={(event) => setCategory(event.currentTarget.value)} placeholder="Optional category" />
						<datalist id="categorySuggestions">
							{categorySuggestions.map((suggestion) => (
								<option key={suggestion} value={suggestion} />
							))}
						</datalist>

						<label className="field-label" htmlFor="instruction">Instruction</label>
						<select id="instruction" value={instruction} onChange={(event) => setInstruction(event.currentTarget.value)}>
							{instructionPresets.map((preset) => (
								<option key={preset.value} value={preset.value}>{preset.label}</option>
							))}
						</select>

						<label className="field-label" htmlFor="model">Model</label>
						<select id="model" value={model} onChange={(event) => setModel(event.currentTarget.value as (typeof MODEL_OPTIONS)[number])}>
							{MODEL_OPTIONS.map((option) => (
								<option key={option} value={option}>{option}</option>
							))}
						</select>

					<div style={{ display: "flex", gap: "20px", marginBottom: "16px" }}>
						<label className="private-mode-control" htmlFor="privateMode">
							<span>Private mode</span>
							<input id="privateMode" type="checkbox" role="switch" checked={privateMode} onChange={(event) => setPrivateMode(event.currentTarget.checked)} />
						</label>

						<label className="private-mode-control" htmlFor="batchMode">
							<span>Batch process</span>
							<input id="batchMode" type="checkbox" role="switch" checked={batchMode} onChange={(event) => setBatchMode(event.currentTarget.checked)} disabled={batchProcessing} />
						</label>
					</div>

					<button type="button" onClick={batchMode ? handleBatchProcess : handleGenerate} disabled={loading || batchProcessing}>
						{loading ? "Generating..." : batchProcessing ? "Processing batch..." : batchMode ? "Batch Process" : "Generate AI Prompt"}
					</button>

					{batchMode && batchResults.length > 0 && (
						<div style={{ marginTop: "20px", overflowX: "auto" }}>
							<h3 style={{ marginBottom: "12px", fontSize: "0.95rem", color: "#f2f5f8" }}>Batch Results</h3>
							<table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
								<thead>
									<tr style={{ borderBottom: "1px solid #2a3342", backgroundColor: "#0d1118" }}>
										<th style={{ textAlign: "left", padding: "10px", color: "#8f9aaa", fontWeight: 600, textTransform: "uppercase" }}>Index</th>
										<th style={{ textAlign: "left", padding: "10px", color: "#8f9aaa", fontWeight: 600, textTransform: "uppercase" }}>Image</th>
										<th style={{ textAlign: "left", padding: "10px", color: "#8f9aaa", fontWeight: 600, textTransform: "uppercase" }}>Status</th>
										<th style={{ textAlign: "left", padding: "10px", color: "#8f9aaa", fontWeight: 600, textTransform: "uppercase" }}>Action</th>
									</tr>
								</thead>
								<tbody>
									{batchResults.map((result) => (
										<tr key={result.fileIndex} style={{ borderBottom: "1px solid #2a3342" }}>
											<td style={{ padding: "10px", color: "#f2f5f8" }}>{result.fileIndex + 1}</td>
											<td style={{ padding: "10px", color: "#f2f5f8", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={result.fileName}>
												{result.fileName}
											</td>
											<td style={{ padding: "10px" }}>
												<span
													style={{
														padding: "4px 8px",
														borderRadius: "4px",
														fontSize: "0.75rem",
														fontWeight: 600,
														backgroundColor:
															result.status === "done"
																? "#1a3a2a"
																: result.status === "error"
																	? "#3a1a2a"
																	: result.status === "processing"
																		? "#2a3a1a"
																		: "#1a1a2a",
														color:
															result.status === "done"
																? "#78e6c0"
																: result.status === "error"
																	? "#ff8d9b"
																	: result.status === "processing"
																		? "#b8e6b8"
																		: "#8f9aaa",
													}}
												>
													{result.status === "done" ? "✓ Done" : result.status === "error" ? "✕ Error" : result.status === "processing" ? "⟳ Processing" : "○ Pending"}
												</span>
											</td>
											<td style={{ padding: "10px" }}>
												{result.status === "done" && result.result && (
													<button
														type="button"
														onClick={async () => {
															try {
																await navigator.clipboard.writeText(result.result);
															} catch {
																const textarea = document.createElement("textarea");
																textarea.value = result.result;
																document.body.appendChild(textarea);
																textarea.select();
																document.execCommand("copy");
																document.body.removeChild(textarea);
															}
														}}
														style={{
															background: "#78e6c0",
															border: 0,
															borderRadius: "4px",
															color: "#082019",
															cursor: "pointer",
															padding: "4px 8px",
															fontSize: "0.75rem",
															fontWeight: 600,
														}}
														title="Copy result"
													>
														📋
													</button>
												)}
												{result.status === "error" && (
													<button
														type="button"
														onClick={() => handleRetryBatchItem(result.fileIndex)}
														disabled={batchProcessing}
														style={{
															background: "#3b82f6",
															border: 0,
															borderRadius: "4px",
															color: "#ffffff",
															cursor: "pointer",
															padding: "4px 8px",
															fontSize: "0.75rem",
															fontWeight: 600,
															marginRight: "8px",
														}}
														title="Retry failed item"
													>
														Retry
													</button>
												)}
												{result.status === "error" && (
													<span style={{ color: "#ff8d9b", fontSize: "0.75rem" }} title={result.error}>
														{result.error?.slice(0, 20)}...
													</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}

					{loading ? (
						<div className="loading" aria-live="polite">
							Analyzing image...
							<div className="progress-track" role="progressbar" aria-label="Image analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressValue}>
								<div className="progress-bar" style={{ width: `${progressValue}%` }} />
							</div>
							<span className="progress-status">{progressMessage} {Math.round(progressValue)}%</span>
						</div>
					) : null}
					<div className="error" aria-live="polite">{error}</div>
					</section>

					<section className="panel" onPaste={onPasteFromKeyboard}>
						<h2>Generated prompt</h2>
						<div className="usage-status" aria-live="polite">
							<div className="usage-card">
								<span className="usage-label">Requests today</span>
								<span className="usage-value">{usage.requests}</span>
							</div>
							<div className="usage-card">
								<span className="usage-label">Last images</span>
								<span className="usage-value">{usage.lastImages ?? "-"}</span>
							</div>
							<div className="usage-card">
								<span className="usage-label">Last seconds</span>
								<span className="usage-value">{usage.lastSeconds == null ? "-" : `${usage.lastSeconds}s`}</span>
							</div>
						</div>
						<div className="textarea-wrap">
							<textarea id="image-cloud-result" value={result} onChange={(event) => setResult(event.currentTarget.value)} placeholder="Your generated prompt will appear here..." />
							<button type="button" className="copy-btn" onClick={copyPrompt} disabled={!result.trim()} aria-label="Copy generated prompt" title="Copy generated prompt">
								{copyLabel}
							</button>
						</div>
						<small>Cloudflare AI vision prompt output is generated using the selected model.</small>
					</section>
				</div>
			</div>
		</div>
	);
}
