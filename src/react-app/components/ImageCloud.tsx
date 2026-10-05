import { useEffect, useMemo, useState, type ClipboardEvent } from "react";
import "../styles/ImagePrompt.css";

type PromptFocus =
	| "full"
	| "dress"
	| "pose"
	| "face"
	| "hair"
	| "accessories"
	| "background"
	| "lighting"
	| "camera"
	| "composition"
	| "colors"
	| "style";

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

const focusInstructions: Record<PromptFocus, string> = {
	full: "Cover the visible subject, outfit, accessories, pose, expression, background, lighting, camera angle, composition, colors, and photographic style.",
	dress: "Focus on garments, fabrics, colors, patterns, fit, layers, shoes, jewelry, bags, and visible accessory details.",
	pose: "Focus on posture, body orientation, hand and leg positions, head angle, facial expression, and framing.",
	face: "Focus on face shape, skin tone, eyes, brows, nose, lips, expression, gaze, and visible facial details without identifying the person.",
	hair: "Focus on hairstyle, length, texture, color, parting, volume, styling, and visible hair accessories.",
	accessories: "Focus on jewelry, glasses, hats, watches, belts, bags, and other visible accessories.",
	background: "Focus on environment, architecture, objects, landscape, depth, and background contrast.",
	lighting: "Focus on light direction, softness, intensity, color temperature, shadows, highlights, and reflection quality.",
	camera: "Focus on shot type, camera angle, framing, distance, depth of field, viewpoint, and perspective.",
	composition: "Focus on subject placement, balance, negative space, foreground and background layering, and visual arrangement.",
	colors: "Focus on the visible color palette, saturation, contrast, materials, and characteristic tones.",
	style: "Focus on the photographic or editorial style, realism, sharpness, texture, and overall visual quality.",
};

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
		return await response.json();
	} catch {
		return { error: { message: await response.text() } };
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
	const [promptFocus, setPromptFocus] = useState<PromptFocus>("full");
	const [result, setResult] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [progressValue, setProgressValue] = useState(0);
	const [progressMessage, setProgressMessage] = useState("Preparing request...");
	const [copyLabel, setCopyLabel] = useState("Copy");

	const generatedPromptText = useMemo(() => {
		return `Create a highly detailed photorealistic image matching the reference image as closely as possible. Preserve the visible clothing, accessories, hairstyle, pose, facial expression, gaze, body orientation, environment, background elements, colors, textures, and composition without inventing unclear details. Capture the subject with a professional full-frame camera using a natural viewpoint and appropriate distance, with realistic optical compression, realistic depth of field, smooth natural blur, precise focus on the subject, fine skin and fabric texture, realistic hair strands, accurate material rendering, subtle natural shadows, balanced exposure, soft directional lighting, true-to-life colors, high dynamic range, realistic contrast, and a polished professional photography aesthetic. ${focusInstructions[promptFocus]} Keep the final response to one natural paragraph, concise but highly specific, and do not include extra analysis or labels.`;
	}, [promptFocus]);

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
		setImagePreviewsVisible(false);
		setError("");
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

				<div className="workspace">
					<section className="panel">
						<h2>Reference image</h2>
						<label className="dropzone" htmlFor="imageInput">
							<span>
								<strong>Choose an image</strong>
								Click to browse or paste an image from your clipboard
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

						<label className="field-label" htmlFor="promptFocus">Prompt focus</label>
						<select id="promptFocus" value={promptFocus} onChange={(event) => setPromptFocus(event.currentTarget.value as PromptFocus)}>
							<option value="full">Full image prompt</option>
							<option value="dress">Dress detail</option>
							<option value="pose">Pose detail</option>
							<option value="face">Face detail</option>
							<option value="hair">Hair detail</option>
							<option value="accessories">Accessories detail</option>
							<option value="background">Background detail</option>
							<option value="lighting">Lighting detail</option>
							<option value="camera">Camera detail</option>
							<option value="composition">Composition detail</option>
							<option value="colors">Color palette</option>
							<option value="style">Style and quality</option>
						</select>

						<label className="field-label" htmlFor="model">Model</label>
						<select id="model" value={model} onChange={(event) => setModel(event.currentTarget.value as (typeof MODEL_OPTIONS)[number])}>
							{MODEL_OPTIONS.map((option) => (
								<option key={option} value={option}>{option}</option>
							))}
						</select>

						<label className="private-mode-control" htmlFor="privateMode">
							<span>Private mode</span>
							<input id="privateMode" type="checkbox" role="switch" checked={privateMode} onChange={(event) => setPrivateMode(event.currentTarget.checked)} />
						</label>

						<button type="button" onClick={handleGenerate} disabled={loading}>
							{loading ? "Generating..." : "Generate AI Prompt"}
						</button>

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
