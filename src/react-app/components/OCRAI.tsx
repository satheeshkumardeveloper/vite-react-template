import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type ChangeEvent } from "react";
import "../styles/OCRAI.css";

type OCRAIProps = {
	embedded?: boolean;
};

type InputMode = "upload" | "paste";

const OCR_MODEL = "gemini-2.5-flash";
const OCR_MODEL_OPTIONS = [
	{ value: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
	{ value: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
	{ value: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
	{ value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
	{ value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
	{ value: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite Preview" },
	{ value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
	{ value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
	{ value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
];

const fileToDataUrl = (file: File): Promise<string> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const value = typeof reader.result === "string" ? reader.result : "";
			if (!value) {
				reject(new Error("Failed to read image."));
				return;
			}
			resolve(value);
		};
		reader.onerror = () => reject(new Error("Failed to read image."));
		reader.readAsDataURL(file);
	});
};

export function OCRAI({ embedded }: OCRAIProps) {
	const [inputMode, setInputMode] = useState<InputMode>("upload");
	const [imageDataUrl, setImageDataUrl] = useState("");
	const [resultText, setResultText] = useState("");
	const [status, setStatus] = useState("");
	const [loading, setLoading] = useState(false);
	const [selectedModel, setSelectedModel] = useState(OCR_MODEL);
	const resultTextareaRef = useRef<HTMLTextAreaElement | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const hasImage = useMemo(() => imageDataUrl.startsWith("data:image/"), [imageDataUrl]);

	const autoResizeResultTextarea = () => {
		const textarea = resultTextareaRef.current;
		if (!textarea) return;
		textarea.style.height = "auto";
		textarea.style.height = `${textarea.scrollHeight}px`;
	};

	useEffect(() => {
		autoResizeResultTextarea();
	}, [resultText]);

	const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			setStatus("Please select an image file.");
			return;
		}
		try {
			const dataUrl = await fileToDataUrl(file);
			setImageDataUrl(dataUrl);
			setStatus("Image loaded.");
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "Failed to load image.");
		}
	};

	const handlePasteImage = async (event: ClipboardEvent<HTMLDivElement>) => {
		const items = Array.from(event.clipboardData.items || []);
		const imageItem = items.find((item) => item.type.startsWith("image/"));
		if (!imageItem) {
			setStatus("Clipboard does not contain an image.");
			return;
		}
		event.preventDefault();
		const file = imageItem.getAsFile();
		if (!file) {
			setStatus("Unable to read pasted image.");
			return;
		}
		try {
			const dataUrl = await fileToDataUrl(file);
			setImageDataUrl(dataUrl);
			setStatus("Image pasted.");
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "Failed to read pasted image.");
		}
	};

	const handleGenerate = async () => {
		if (!hasImage || loading) {
			if (!hasImage) setStatus("Upload or paste an image first.");
			return;
		}

		setLoading(true);
		setStatus("Extracting text...");
		try {
			const response = await fetch("/api/ocr-ai", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					imageDataUrl,
					model: selectedModel,
				}),
			});

			const payload = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
			if (!response.ok) {
				throw new Error(payload?.error || "OCR request failed");
			}

			const text = String(payload?.text || "").trim();
			setResultText(text);
			setStatus(text ? "OCR complete." : "No text found.");
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "OCR failed.");
		} finally {
			setLoading(false);
		}
	};

	const handleCopy = async () => {
		if (!resultText.trim()) {
			setStatus("No text to copy.");
			return;
		}
		try {
			await navigator.clipboard.writeText(resultText);
			setStatus("Text copied.");
		} catch {
			setStatus("Clipboard access is blocked by the browser.");
		}
	};

	const handleClear = () => {
		setResultText("");
		setStatus("Text cleared.");
	};

	const handleClearImage = () => {
		setImageDataUrl("");
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
		setStatus("Image cleared.");
	};

	return (
		<div className={embedded ? "ocr-ai ocr-ai--embedded" : "ocr-ai"}>
			<div className="ocr-ai-top-row">
				<div className="ocr-ai-mode-switch" role="tablist" aria-label="Image input mode">
					<button
						type="button"
						className={inputMode === "upload" ? "ocr-ai-mode-button ocr-ai-mode-button--active" : "ocr-ai-mode-button"}
						onClick={() => setInputMode("upload")}
					>
						Upload Image
					</button>
					<button
						type="button"
						className={inputMode === "paste" ? "ocr-ai-mode-button ocr-ai-mode-button--active" : "ocr-ai-mode-button"}
						onClick={() => setInputMode("paste")}
					>
						Paste Image
					</button>
				</div>
				<div className="ocr-ai-model-select-wrap">
					<label htmlFor="ocr-model-select">Model</label>
					<select id="ocr-model-select" value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
						{OCR_MODEL_OPTIONS.map((model) => (
							<option key={model.value} value={model.value}>
								{model.label}
							</option>
						))}
					</select>
				</div>
				<div className="ocr-ai-top-actions">
					<button
						type="button"
						className="ocr-ai-copy-button"
						onClick={handleClearImage}
						disabled={!hasImage}
					>
						Clear Image
					</button>
					<button
						type="button"
						className="ocr-ai-generate-button"
						onClick={() => void handleGenerate()}
						disabled={!hasImage || loading}
						title="Generate OCR"
					>
						{loading ? "..." : "⚡"}
					</button>
				</div>
			</div>

			{inputMode === "upload" ? (
				<div className="ocr-ai-upload-card">
					<div className="ocr-ai-upload-card-header">
						<h3>Upload Image</h3>
						<p>PNG, JPG, WEBP • Select an image to extract text</p>
					</div>
					<label className="ocr-ai-upload-field" aria-label="Choose image file">
						<span className="ocr-ai-upload-button">Choose Image</span>
						<input ref={fileInputRef} type="file" accept="image/*" onChange={(event) => void handleFileChange(event)} />
					</label>
				</div>
			) : (
				<div
					className="ocr-ai-paste-zone"
					onPaste={(event) => void handlePasteImage(event)}
					tabIndex={0}
					role="textbox"
					aria-label="Paste image area"
				>
					Click here and paste image from clipboard (Ctrl+V)
				</div>
			)}

			{hasImage ? (
				<div className="ocr-ai-preview-wrap">
					<img src={imageDataUrl} alt="OCR source preview" className="ocr-ai-preview" />
				</div>
			) : null}

			<div className="ocr-ai-result-section">
				<div className="ocr-ai-result-header">
					<h3>OCR Text</h3>
					<div className="ocr-ai-result-actions">
						<button type="button" className="ocr-ai-copy-button" onClick={handleClear} disabled={!resultText.trim()}>
							Clear
						</button>
						<button type="button" className="ocr-ai-copy-button" onClick={() => void handleCopy()} disabled={!resultText.trim()}>
							Copy
						</button>
					</div>
				</div>
				<textarea
					ref={resultTextareaRef}
					className="ocr-ai-result-textarea"
					value={resultText}
					onChange={(event) => {
						setResultText(event.target.value);
						autoResizeResultTextarea();
					}}
					placeholder="OCR result will appear here..."
				/>
			</div>

			{status ? <div className="ocr-ai-status">{status}</div> : null}
		</div>
	);
}
