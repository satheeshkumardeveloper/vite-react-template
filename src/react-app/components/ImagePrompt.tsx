import { useEffect, useMemo, useRef, useState } from "react";
import "../styles/ImagePrompt.css";

type GeminiKey = "primary" | "secondary" | "tertiary";

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
	| "product"
	| "style";

type UsageRecord = {
	date: string;
	requests: number;
	lastTokens: number | null;
};

const MODEL = "gemini-3.6-flash";
const MAX_DEMAND_RETRIES = 5;
const DEMAND_RETRY_DELAY_MS = 2000;
const USAGE_STORAGE_KEY = "geminiPromptUsage";
const PRIVATE_MODE_STORAGE_KEY = "geminiPromptPrivateMode";

const focusInstructions: Record<PromptFocus, string> = {
	full: "Return a complete image-generation prompt covering all visible details.",
	dress: "Return ONLY a detailed clothing prompt. Describe garment type, materials, fabric texture, colors, patterns, fit, layers, footwear, jewelry, bags, and other accessories. Do not describe pose, facial features, or background.",
	pose: "Return ONLY a detailed pose prompt. Describe posture, body orientation, hand placement, leg position, head angle, facial expression, camera angle, framing, and composition. Do not describe clothing or background.",
	face: "Return ONLY a detailed facial-feature prompt. Describe apparent age range, face shape, skin tone, eyes, eyebrows, nose, lips, expression, makeup, and distinctive visible features. Do not identify the person or describe clothing, pose, or background.",
	hair: "Return ONLY a detailed hair prompt. Describe length, cut, parting, texture, volume, curl pattern, color, highlights, styling, and visible hair accessories. Do not describe the face, clothing, pose, or background.",
	accessories: "Return ONLY a detailed accessories prompt. Describe jewelry, eyewear, hats, watches, bags, belts, shoes, and other visible accessories, including materials, colors, placement, and styling. Do not describe the person, pose, or background.",
	background: "Return ONLY a detailed background and environment prompt. Describe location, surfaces, architecture, objects, landscape, atmosphere, depth, and background blur. Do not describe the person, clothing, or pose.",
	lighting: "Return ONLY a detailed lighting prompt. Describe light source, direction, softness, intensity, color temperature, shadows, highlights, reflections, and overall mood. Do not describe the subject, clothing, or background objects.",
	camera: "Return ONLY a detailed camera prompt. Describe shot type, camera angle, camera distance, lens perspective, focal length impression, depth of field, focus point, and framing. Do not describe the subject or clothing.",
	composition: "Return ONLY a detailed composition prompt. Describe subject placement, visual balance, crop, negative space, leading lines, foreground and background layers, framing, and depth. Do not describe clothing or facial features.",
	colors: "Return ONLY a detailed color-palette prompt. Describe dominant, secondary, and accent colors, their distribution, contrast, saturation, color temperature, and overall palette mood. Do not describe the subject or pose.",
	product: "Return ONLY a detailed product prompt. Describe the product type, shape, material, texture, finish, color, branding visible in the image, condition, arrangement, and product-photography presentation. Do not describe people unless required to explain how the product is used.",
	style: "Return ONLY a detailed visual-style and quality prompt. Describe the medium, photography or art style, realism, detail level, rendering quality, grain, sharpness, retouching, post-processing, and visual mood. Do not describe the subject, clothing, or pose.",
};

const promptFocusOptions: Array<{ value: PromptFocus; label: string }> = [
	{ value: "full", label: "Full image prompt" },
	{ value: "dress", label: "Dress detail" },
	{ value: "pose", label: "Pose detail" },
	{ value: "face", label: "Face detail" },
	{ value: "hair", label: "Hair detail" },
	{ value: "accessories", label: "Accessories detail" },
	{ value: "background", label: "Background detail" },
	{ value: "lighting", label: "Lighting detail" },
	{ value: "camera", label: "Camera detail" },
	{ value: "composition", label: "Composition detail" },
	{ value: "colors", label: "Color palette" },
	{ value: "product", label: "Product detail" },
	{ value: "style", label: "Style and quality" },
];

function loadUsage(): UsageRecord {
	const today = new Date().toISOString().slice(0, 10);
	const savedUsage = JSON.parse(localStorage.getItem(USAGE_STORAGE_KEY) || "null") as UsageRecord | null;

	if (!savedUsage || savedUsage.date !== today) {
		return { date: today, requests: 0, lastTokens: null };
	}

	return savedUsage;
}

function fileToBase64(file: File) {
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

export function ImagePrompt({ onBackToDashboard, embedded = false }: { onBackToDashboard?: () => void; embedded?: boolean }) {
	const [usage, setUsage] = useState<UsageRecord>(() => loadUsage());
	const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
	const [previewUrls, setPreviewUrls] = useState<string[]>([]);
	const [imagePreviewsVisible, setImagePreviewsVisible] = useState(false);
	const [category, setCategory] = useState("Prompt");
	const [categorySuggestions, setCategorySuggestions] = useState<string[]>([]);
	const [promptFocus, setPromptFocus] = useState<PromptFocus>("full");
	const [geminiKey, setGeminiKey] = useState<GeminiKey>("primary");
	const [privateMode, setPrivateMode] = useState(() => localStorage.getItem(PRIVATE_MODE_STORAGE_KEY) === "true");
	const [result, setResult] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [progressValue, setProgressValue] = useState(0);
	const [progressMessage, setProgressMessage] = useState("Preparing request...");
	const [copyLabel, setCopyLabel] = useState("Copy");

	const imageInputRef = useRef<HTMLInputElement | null>(null);
	const progressTimerRef = useRef<number | null>(null);
	const progressStartedAtRef = useRef<number>(0);
	const activeRequestControllerRef = useRef<AbortController | null>(null);
	const copyResetTimerRef = useRef<number | null>(null);

	const imageCountLabel = useMemo(() => {
		const count = selectedFiles.length;
		return `${count} image${count === 1 ? "" : "s"} selected`;
	}, [selectedFiles.length]);

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
		return () => {
			if (progressTimerRef.current !== null) {
				window.clearInterval(progressTimerRef.current);
			}
			if (copyResetTimerRef.current !== null) {
				window.clearTimeout(copyResetTimerRef.current);
			}
			activeRequestControllerRef.current?.abort();
		};
	}, []);

	useEffect(() => {
		localStorage.setItem(PRIVATE_MODE_STORAGE_KEY, String(privateMode));
	}, [privateMode]);

	useEffect(() => {
		localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(usage));
	}, [usage]);

	const setSelectedImageFiles = (files: File[]) => {
		const filtered = files.filter((file) => file.type.startsWith("image/"));
		setSelectedFiles(filtered);

		const input = imageInputRef.current;
		if (input) {
			const transfer = new DataTransfer();
			filtered.forEach((file) => transfer.items.add(file));
			input.files = transfer.files;
		}

		setError("");
	};

	const renderProgress = (value: number, message: string) => {
		const nextValue = Math.max(0, Math.min(value, 100));
		setProgressValue(nextValue);
		setProgressMessage(message);
	};

	const startProgress = () => {
		progressStartedAtRef.current = Date.now();
		renderProgress(1, "Preparing request...");
		progressTimerRef.current = window.setInterval(() => {
			const elapsedSeconds = (Date.now() - progressStartedAtRef.current) / 1000;
			const estimatedProgress = Math.min(92, 12 + elapsedSeconds * 8);
			renderProgress(estimatedProgress, `Analyzing image... ${elapsedSeconds.toFixed(1)}s`);
		}, 250);
	};

	const stopProgress = (success: boolean) => {
		if (progressTimerRef.current !== null) {
			window.clearInterval(progressTimerRef.current);
			progressTimerRef.current = null;
		}

		const elapsedSeconds = ((Date.now() - progressStartedAtRef.current) / 1000).toFixed(1);
		renderProgress(success ? 100 : 0, success ? `Complete in ${elapsedSeconds}s` : "Request stopped");
	};

	const isHighDemandResponse = (data: unknown) => {
		const candidate = data as { error?: { message?: string } } | { message?: string } | string | null;
		const message = candidate && typeof candidate === "object" && "error" in candidate
			? candidate.error?.message
			: candidate && typeof candidate === "object" && "message" in candidate
				? candidate.message
				: candidate;
		return String(message || "").toLowerCase().includes("currently experiencing high demand");
	};

	const requestGeminiWithRetry = async (url: string, options: RequestInit) => {
		const signal = options.signal;
		if (!signal) {
			throw new Error("Missing abort signal.");
		}

		for (let retryCount = 0; retryCount <= MAX_DEMAND_RETRIES; retryCount += 1) {
			const response = await fetch(url, options);
			const data = await readResponseJson(response);

			if (response.ok || !isHighDemandResponse(data) || retryCount === MAX_DEMAND_RETRIES) {
				return { response, data, retryCount };
			}

			const completedRetries = retryCount + 1;
			setError(`High demand. Retrying... ${completedRetries}/${MAX_DEMAND_RETRIES}`);
			renderProgress(Math.min(92, 20 + completedRetries * 10), `Retrying request ${completedRetries}/${MAX_DEMAND_RETRIES}...`);

			await new Promise<void>((resolve, reject) => {
				const timeout = window.setTimeout(resolve, DEMAND_RETRY_DELAY_MS);
				const handleAbort = () => {
					window.clearTimeout(timeout);
					reject(new DOMException("Request stopped", "AbortError"));
				};
				signal.addEventListener("abort", handleAbort, { once: true });
			});
		}

		throw new Error("Unexpected request failure.");
	};

	const copyPrompt = async () => {
		if (!result) {
			return;
		}

		try {
			await navigator.clipboard.writeText(result);
		} catch {
			const textarea = document.getElementById("result") as HTMLTextAreaElement | null;
			if (textarea) {
				textarea.focus();
				textarea.select();
				document.execCommand("copy");
				textarea.setSelectionRange(textarea.value.length, textarea.value.length);
			}
		}

		setCopyLabel("Copied");
		if (copyResetTimerRef.current !== null) {
			window.clearTimeout(copyResetTimerRef.current);
		}
		copyResetTimerRef.current = window.setTimeout(() => {
			setCopyLabel("Copy");
		}, 1600);
	};

	const handleGenerate = async () => {
		if (!selectedFiles.length) {
			setError("Please select at least one image.");
			return;
		}

		const selectedKey = geminiKey;
		const files = selectedFiles;
		setResult("");
		setError("");
		setLoading(true);
		activeRequestControllerRef.current = new AbortController();
		startProgress();

		try {
			const imageParts = await Promise.all(
				files.map(async (file) => {
					const base64Image = await fileToBase64(file);
					return {
						inline_data: {
							mime_type: file.type,
							data: base64Image.split(",")[1],
						},
					};
				}),
			);

			const requestBody = {
				contents: [
					{
						parts: [
							{
								text: `Analyze this image and create a highly detailed
AI image-generation prompt that can recreate the image.

Describe:

- Main subject
- Person's approximate age
- Facial features
- Hair style and color
- Clothing
- Clothing colors
- Accessories
- Pose
- Body position
- Facial expression
- Background
- Environment
- Lighting
- Camera angle
- Camera distance
- Composition
- Depth of field
- Photography style
- Image quality
- Colors
- Important visual details

Do NOT identify the person or guess their identity.

${focusInstructions[promptFocus]}
Do not add explanations before or after the prompt.`,
							},
							...imageParts,
						],
					},
				],
			};

			const request = await requestGeminiWithRetry(
				"/api/image-prompt-generate",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					signal: activeRequestControllerRef.current.signal,
					body: JSON.stringify({
						key: selectedKey,
						model: MODEL,
						requestBody,
					}),
				},
			);

			const response = request.response;
			const data = request.data as {
				candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
				usageMetadata?: { totalTokenCount?: number };
				error?: { message?: string };
			};

			if (request.retryCount > 0) {
				setError(`Succeeded after ${request.retryCount} retr${request.retryCount === 1 ? "y" : "ies"}.`);
			}

			if (!response.ok) {
				throw new Error(data.error?.message || "Gemini API request failed");
			}

			const generatedText = data.candidates?.[0]?.content?.parts
				?.map((part) => part.text || "")
				.join("")
				.trim();

			if (!generatedText) {
				throw new Error("No prompt was returned by Gemini.");
			}

			setResult(generatedText);
			stopProgress(true);

			if (!privateMode) {
				await saveGeneratedPrompt(generatedText, category, selectedFiles);
				try {
					setCategorySuggestions(await loadCategorySuggestions());
				} catch (loadError) {
					console.error("Failed to refresh category suggestions:", loadError);
				}
			}

			setUsage((currentUsage) => {
				const nextUsage = {
					...currentUsage,
					requests: currentUsage.requests + 1,
					lastTokens: data.usageMetadata?.totalTokenCount ?? null,
				};
				localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(nextUsage));
				return nextUsage;
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setError(message === "Request stopped" ? "Request stopped." : message);
			stopProgress(false);
		} finally {
			setLoading(false);
			activeRequestControllerRef.current = null;
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

			setSelectedImageFiles([...selectedFiles, ...pastedImages]);
			setError(`${pastedImages.length} image${pastedImages.length === 1 ? "" : "s"} pasted from clipboard.`);
		} catch (clipboardError) {
			const errorName = clipboardError instanceof DOMException ? clipboardError.name : "";
			setError(errorName === "NotAllowedError" ? "Clipboard permission was denied." : "Failed to paste image from clipboard.");
		}
	};

	const handleClearImages = () => {
		setImagePreviewsVisible(false);
		setSelectedImageFiles([]);
		if (imageInputRef.current) {
			imageInputRef.current.value = "";
		}
		setError("");
	};

	return (
		<div className={embedded ? "image-prompt-page embedded" : "image-prompt-page"}>
			<div className={embedded ? "image-prompt-shell embedded" : "image-prompt-shell"}>
				<div className="page-header">
					<div>
						{/* <h1>Image to AI Prompt</h1> */}
						{/* <p className="intro">Turn a reference image into a detailed, ready-to-use generation prompt.</p> */}
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
							<input
								ref={imageInputRef}
								type="file"
								id="imageInput"
								accept="image/jpeg,image/png,image/webp"
								multiple
								onChange={(event) => setSelectedImageFiles(Array.from(event.currentTarget.files || []))}
							/>
						</label>

						<div className="image-controls">
							<span id="imageCount" aria-live="polite">
								{imageCountLabel}
							</span>
							<div className="image-actions">
								<button type="button" onClick={handlePasteImages}>
									Paste
								</button>
								<button type="button" onClick={handleClearImages} disabled={!selectedFiles.length}>
									Clear
								</button>
								<button
									type="button"
									onClick={() => setImagePreviewsVisible((current) => !current)}
									disabled={!selectedFiles.length}
								>
									{imagePreviewsVisible ? "Hide images" : "Show images"}
								</button>
							</div>
						</div>
						<div className="preview-grid" hidden={!selectedFiles.length || !imagePreviewsVisible}>
							{previewUrls.map((url, index) => (
								<img key={`${selectedFiles[index]?.name}-${index}`} src={url} alt={`Selected image ${index + 1}`} />
							))}
						</div>

						<label className="field-label" htmlFor="category">
							Category
						</label>
						<input
							id="category"
							type="text"
							list="categorySuggestions"
							value={category}
							onChange={(event) => setCategory(event.currentTarget.value)}
							placeholder="Optional category"
						/>
						<datalist id="categorySuggestions">
							{categorySuggestions.map((suggestion) => (
								<option key={suggestion} value={suggestion} />
							))}
						</datalist>

						<label className="field-label" htmlFor="promptFocus">
							Prompt focus
						</label>
						<select id="promptFocus" value={promptFocus} onChange={(event) => setPromptFocus(event.currentTarget.value as PromptFocus)}>
							{promptFocusOptions.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>

						<div className="key-selector">
							<label htmlFor="geminiKey">Gemini API key</label>
							<select id="geminiKey" value={geminiKey} onChange={(event) => setGeminiKey(event.currentTarget.value as GeminiKey)}>
								<option value="primary">Key 1 - Primary</option>
								<option value="secondary">Key 2 - Backup</option>
								<option value="tertiary">Key 3 - Backup</option>
							</select>
							<span id="keyStatus" aria-live="polite">
								{geminiKey === "primary" ? "Key 1 is selected for this request." : geminiKey === "secondary" ? "Key 2 is selected for this request." : "Key 3 is selected for this request."}
							</span>
						</div>

						<label className="private-mode-control" htmlFor="privateMode">
							<span>Private mode</span>
							<input
								id="privateMode"
								type="checkbox"
								role="switch"
								checked={privateMode}
								onChange={(event) => setPrivateMode(event.currentTarget.checked)}
							/>
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
								<button type="button" className="stop-request-btn" onClick={() => activeRequestControllerRef.current?.abort()}>
									Stop
								</button>
							</div>
						) : null}
						<div className="error" aria-live="polite">{error}</div>
					</section>

					<section className="panel">
						<h2>Generated prompt</h2>
						<div className="usage-status" aria-live="polite">
							<div className="usage-card">
								<span className="usage-label">Requests today</span>
								<span className="usage-value">{usage.requests}</span>
							</div>
							<div className="usage-card">
								<span className="usage-label">Last request tokens</span>
								<span className="usage-value">{usage.lastTokens ?? "-"}</span>
							</div>
						</div>

						<div className="textarea-wrap">
							<textarea
								id="result"
								value={result}
								onChange={(event) => setResult(event.currentTarget.value)}
								placeholder="Your generated prompt will appear here..."
							/>
							<button type="button" className="copy-btn" onClick={copyPrompt} disabled={!result.trim()} aria-label="Copy generated prompt" title="Copy generated prompt">
								<span>{copyLabel}</span>
							</button>
						</div>
						<small>Saved prompts are stored in your Cloudflare database when private mode is off. Token usage comes from the Gemini response.</small>
					</section>
				</div>
			</div>
		</div>
	);
}