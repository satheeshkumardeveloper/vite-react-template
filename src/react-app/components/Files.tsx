import { useEffect, useMemo, useRef, useState } from "react";
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import JSZip from "jszip";
import "../styles/Files.css";

type FilesProps = {
	embedded?: boolean;
};

type FileRecord = {
	Key: string;
	LastModified?: Date | string;
	ETag?: string;
	Size?: number;
	StorageClass?: string;
};

type ConfigValues = {
	endpoint: string;
	bucket: string;
	region: string;
	prefix: string;
	accessKey: string;
	secretKey: string;
};

const SAMPLE_MOCK_FILES: FileRecord[] = [
	{
		Key: "documents/project-proposal.pdf",
		LastModified: new Date("2026-08-20"),
		ETag: '"mock-etag-1"',
		Size: 245678,
		StorageClass: "STANDARD",
	},
	{
		Key: "documents/budget-2026.xlsx",
		LastModified: new Date("2026-08-18"),
		ETag: '"mock-etag-2"',
		Size: 156234,
		StorageClass: "STANDARD",
	},
	{
		Key: "images/screenshot-001.png",
		LastModified: new Date("2026-08-25"),
		ETag: '"mock-etag-3"',
		Size: 512048,
		StorageClass: "STANDARD",
	},
	{
		Key: "images/logo.svg",
		LastModified: new Date("2026-08-22"),
		ETag: '"mock-etag-4"',
		Size: 28456,
		StorageClass: "STANDARD",
	},
	{
		Key: "videos/tutorial.mp4",
		LastModified: new Date("2026-08-15"),
		ETag: '"mock-etag-5"',
		Size: 87654321,
		StorageClass: "STANDARD",
	},
	{
		Key: "archive/backup-2026-08.zip",
		LastModified: new Date("2026-08-01"),
		ETag: '"mock-etag-6"',
		Size: 234567890,
		StorageClass: "STANDARD",
	},
];

const SYSTEM_MODE: 0 | 1 = 0;

function getTimestampForFileName(dateValue = new Date()) {
	const year = dateValue.getFullYear();
	const month = String(dateValue.getMonth() + 1).padStart(2, "0");
	const day = String(dateValue.getDate()).padStart(2, "0");
	const hour = String(dateValue.getHours()).padStart(2, "0");
	const minute = String(dateValue.getMinutes()).padStart(2, "0");
	const second = String(dateValue.getSeconds()).padStart(2, "0");
	const milli = String(dateValue.getMilliseconds()).padStart(3, "0");
	return `${year}${month}${day}_${hour}${minute}${second}_${milli}`;
}

function sanitizeFileName(name: string) {
	return String(name || "")
		.replace(/[\\/:*?"<>|]+/g, "_")
		.replace(/\s+/g, " ")
		.trim();
}

function withPrefix(prefix: string, fileName: string) {
	if (!prefix) return fileName;
	return `${prefix.replace(/^\/+|\/+$/g, "")}/${fileName}`;
}

function getUploadBasePrefix(cfgPrefix: string, targetFolderName: string) {
	const a = (cfgPrefix || "").trim().replace(/^\/+|\/+$/g, "");
	const b = (targetFolderName || "").trim().replace(/^\/+|\/+$/g, "");
	if (a && b) return `${a}/${b}`;
	return a || b || "";
}

function getFolderPathFromKey(key: string) {
	const cleanKey = String(key || "").trim();
	if (!cleanKey.includes("/")) return "(root)";
	return cleanKey.substring(0, cleanKey.lastIndexOf("/"));
}

function getFolderDisplayParts(folderPath: string) {
	if (!folderPath || folderPath === "(root)") {
		return { parent: "(root)", subfolder: "-" };
	}
	const parts = folderPath.split("/").filter(Boolean);
	return {
		parent: parts[0] || "(root)",
		subfolder: parts.length > 1 ? parts.slice(1).join("/") : "-",
	};
}

function isImageKey(key: string) {
	return /\.(jpe?g|png|gif|webp|bmp|svg|ico|avif|tiff?)$/i.test(key || "");
}

function isThumbCacheKey(key: string) {
	return String(key || "").startsWith("thumbs/");
}

function formatBytes(bytes = 0) {
	if (bytes === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

function getFileIcon(key: string) {
	const ext = (key || "").split(".").pop()?.toLowerCase();
	if (["pdf"].includes(ext ?? "")) return "📄";
	if (["zip", "rar", "gz", "tar", "7z"].includes(ext ?? "")) return "🗜";
	if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext ?? "")) return "🎬";
	if (["mp3", "wav", "ogg", "flac", "aac"].includes(ext ?? "")) return "🎵";
	if (["doc", "docx"].includes(ext ?? "")) return "📝";
	if (["xls", "xlsx", "csv"].includes(ext ?? "")) return "📊";
	if (["ppt", "pptx"].includes(ext ?? "")) return "📑";
	return "📁";
}

function getExtensionFromMime(type: string) {
	if (type === "image/png") return "png";
	if (type === "image/jpeg") return "jpg";
	if (type === "image/webp") return "webp";
	if (type === "image/gif") return "gif";
	if (type === "image/bmp") return "bmp";
	return "png";
}

function getExtensionFromContentType(contentType: string) {
	const type = String(contentType || "").toLowerCase();
	if (!type.includes("/")) return "bin";
	const subtype = type.split("/")[1] || "bin";
	const cleaned = subtype.split(";")[0].trim();
	if (!cleaned) return "bin";
	if (cleaned === "jpeg") return "jpg";
	if (cleaned.includes("svg")) return "svg";
	return cleaned.replace(/[^a-z0-9.+-]/g, "") || "bin";
}

function getFileNameFromUrl(url: string, fallbackExtension = "bin") {
	try {
		const parsed = new URL(url);
		const rawName = (parsed.pathname.split("/").pop() || "").trim();
		const decodedName = sanitizeFileName(decodeURIComponent(rawName));
		if (decodedName) return decodedName;
	} catch {
		// ignore
	}
	return `urlfile_${getTimestampForFileName()}.${fallbackExtension}`;
}

export function Files({ embedded }: FilesProps) {
	const [settings, setSettings] = useState<ConfigValues>({
		endpoint: "https://154ae3f25894982cac7efae1a24569ae.r2.cloudflarestorage.com",
		bucket: "sathesh",
		region: "auto",
		prefix: "",
		accessKey: "422be9dec1585909153c34f9524f715d",
		secretKey: "4bcafc797df3f74247aab1469e53c8cd0b7e7960174e7c641d19752366832cdf",
	});
	const [files, setFiles] = useState<FileRecord[]>([]);
	const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
	const [searchTerm, setSearchTerm] = useState("");
	const [status, setStatus] = useState("");
	const [statusKind, setStatusKind] = useState<"ok" | "error" | "">("");
	const [uploadFolderName, setUploadFolderName] = useState("");
	const [pastedImages, setPastedImages] = useState<File[]>([]);
	const [urlFiles, setUrlFiles] = useState<File[]>([]);
	const [showThumbs, setShowThumbs] = useState(false);
	const [galleryViewEnabled, setGalleryViewEnabled] = useState(false);
	const [folderFilter, setFolderFilter] = useState("(root)");
	const [uploadFolderOptions, setUploadFolderOptions] = useState<string[]>([]);
	const [uploadFolderMenuOpen, setUploadFolderMenuOpen] = useState(false);
	const [uploadFolderActiveIndex, setUploadFolderActiveIndex] = useState(0);
	const [showConfirm, setShowConfirm] = useState(false);
	const [confirmText, setConfirmText] = useState("");
	const [confirmAction, setConfirmAction] = useState<(() => Promise<void> | void) | null>(null);
	const [showDeleteLoader, setShowDeleteLoader] = useState(false);
	const [deleteLoaderText, setDeleteLoaderText] = useState("Deleting...");
	const [thumbModalSrc, setThumbModalSrc] = useState<string | null>(null);
	const [uploadProgress, setUploadProgress] = useState({ visible: false, percent: 0, label: "Preparing upload..." });

	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const folderInputRef = useRef<HTMLInputElement | null>(null);
	const uploadFolderMenuRef = useRef<HTMLDivElement | null>(null);
	const uploadFolderSelectRef = useRef<HTMLDivElement | null>(null);
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const statusRef = useRef<string>("");

	const setStatusMessage = (message: string, kind: "ok" | "error" | "" = "") => {
		setStatus(message);
		setStatusKind(kind);
		statusRef.current = message;
	};

	const getConfig = () => {
		const endpoint = settings.endpoint.trim();
		const bucket = settings.bucket.trim();
		const region = settings.region.trim() || "auto";
		const prefix = settings.prefix.trim();
		const accessKeyId = settings.accessKey.trim();
		const secretAccessKey = settings.secretKey.trim();
		if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
			throw new Error("Endpoint, Bucket, Access Key, and Secret Key are required.");
		}
		if (secretAccessKey.startsWith("cfat_")) {
			throw new Error("Invalid credential type: cfat_ token is a Cloudflare API token, not an R2 S3 Secret Access Key.");
		}
		return {
			endpoint,
			bucket,
			region,
			prefix,
			credentials: { accessKeyId, secretAccessKey },
		};
	};

	const getClient = (cfg: ReturnType<typeof getConfig>) =>
		new S3Client({
			region: cfg.region,
			endpoint: cfg.endpoint,
			credentials: cfg.credentials,
			forcePathStyle: true,
		});

	const folderInputProps = {
		webkitdirectory: "",
		directory: "",
	} as Record<string, string>;

	const getUploadQueue = () => {
		const fileList = fileInputRef.current?.files ? Array.from(fileInputRef.current.files) : [];
		const folderList = folderInputRef.current?.files ? Array.from(folderInputRef.current.files) : [];
		return [...fileList, ...folderList, ...pastedImages, ...urlFiles];
	};

	const createFolderTree = (paths: string[]) => {
		const root: Record<string, any> = {};
		for (const path of paths) {
			if (!path || path === "(root)") continue;
			const segments = path.split("/").filter(Boolean);
			let pointer = root;
			for (const segment of segments) {
				if (!pointer[segment]) pointer[segment] = {};
				pointer = pointer[segment];
			}
		}
		return root;
	};

	const renderFolderToolbar = (list: FileRecord[]) => {
		const folderSet = new Set<string>();
		for (const item of list) folderSet.add(getFolderPathFromKey(item.Key || ""));
		const tree = createFolderTree(Array.from(folderSet));
		return { tree, folderSet };
	};

	const folderTreeData = useMemo(() => renderFolderToolbar(files), [files]);

	const filteredFiles = useMemo(() => {
		const query = searchTerm.trim().toLowerCase();
		return files.filter((item) => {
			const folder = getFolderPathFromKey(item.Key || "");
			const folderMatched =
				!folderFilter || folderFilter === "(root)"
					? folder === "(root)"
					: folder === folderFilter || folder.startsWith(`${folderFilter}/`) || folderFilter === "";
			const keyMatched = !query || (item.Key || "").toLowerCase().includes(query);
			return folderMatched && keyMatched;
		});
	}, [files, folderFilter, searchTerm]);

	const browseFolder = (path: string) => {
		setFolderFilter(path);
	};

	const handleSelectRow = (key: string, checked: boolean) => {
		setSelectedKeys((prev) => {
			if (checked) return [...new Set([...prev, key])];
			return prev.filter((item) => item !== key);
		});
	};

	const getDownloadUrl = async (cfg: ReturnType<typeof getConfig>, key: string, forceDownload = false) => {
		if (SYSTEM_MODE === 0) {
			return `data:text/plain,Mock%20Download:%20${encodeURIComponent(key)}`;
		}
		const client = getClient(cfg);
		const command = new GetObjectCommand({
			Bucket: cfg.bucket,
			Key: key,
			ResponseContentDisposition: forceDownload ? `attachment; filename="${encodeURIComponent(key.split("/").pop() || "download")}"` : undefined,
		});
		return getSignedUrl(client, command, { expiresIn: 3600 });
	};

	const getObjectKeyFromFile = (file: File, prefix: string) => {
		const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath && (file as File & { webkitRelativePath?: string }).webkitRelativePath.trim()
			? (file as File & { webkitRelativePath?: string }).webkitRelativePath
			: file.name;
		const normalizedPath = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
		return withPrefix(prefix, normalizedPath);
	};

	const addFileFromUrl = async () => {
		const rawUrl = (document.getElementById("sourceUrl") as HTMLInputElement | null)?.value?.trim() || "";
		if (!rawUrl) {
			setStatusMessage("Enter a file URL first.", "error");
			return;
		}
		let parsedUrl: URL;
		try {
			parsedUrl = new URL(rawUrl);
			if (!/^https?:$/i.test(parsedUrl.protocol)) {
				throw new Error("Only http/https URLs are allowed.");
			}
		} catch {
			setStatusMessage("Invalid URL. Use a valid http/https file URL.", "error");
			return;
		}

		try {
			setStatusMessage("Fetching file from URL...");
			const response = await fetch(parsedUrl.href, { mode: "cors" });
			if (!response.ok) throw new Error(`Fetch failed: HTTP ${response.status}`);
			const blob = await response.blob();
			const extension = getExtensionFromContentType(blob.type);
			let fileName = getFileNameFromUrl(parsedUrl.href, extension);
			if (!fileName.includes(".")) fileName = `${fileName}.${extension}`;
			const nextFile = new File([blob], fileName, { type: blob.type || "application/octet-stream", lastModified: Date.now() });
			setUrlFiles((prev) => [...prev, nextFile]);
			const sourceUrlInput = document.getElementById("sourceUrl") as HTMLInputElement | null;
			if (sourceUrlInput) sourceUrlInput.value = "";
			setStatusMessage(`Added URL file: ${nextFile.name}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (String(message).toLowerCase().includes("cors")) {
				setStatusMessage("URL fetch failed due to CORS on source URL. Allow CORS there or use backend proxy.", "error");
				return;
			}
			setStatusMessage(`URL add failed: ${message}`, "error");
		}
	};

	const normalizePastedFile = (file: File, indexOffset = 0) => {
		const ext = getExtensionFromMime(file.type || "image/png");
		const timestamp = getTimestampForFileName(new Date());
		const suffix = indexOffset > 0 ? `_${indexOffset + 1}` : "";
		const baseName = `image_${timestamp}${suffix}.${ext}`;
		return new File([file], baseName, { type: file.type || "image/png", lastModified: Date.now() });
	};

	const addPastedImagesFromClipboard = (event: React.ClipboardEvent<HTMLDivElement>) => {
		event.preventDefault();
		const clipboardData = event.clipboardData;
		if (!clipboardData) return;
		const added: File[] = [];
		for (const item of Array.from(clipboardData.items)) {
			if (item.type.startsWith("image/")) {
				const file = item.getAsFile();
				if (file) added.push(file);
			}
		}
		if (!added.length && clipboardData.files && clipboardData.files.length) {
			for (const file of Array.from(clipboardData.files)) {
				if (file.type.startsWith("image/")) added.push(file);
			}
		}
		if (!added.length) return;
		const startIndex = pastedImages.length;
		const normalized = added.map((file, index) => normalizePastedFile(file, startIndex + index));
		setPastedImages((prev) => [...prev, ...normalized]);
		setStatusMessage(`Added ${added.length} pasted image${added.length === 1 ? "" : "s"}.`);
	};

	const clearPastedAndUrlFiles = () => {
		setPastedImages([]);
		setUrlFiles([]);
		setStatusMessage("Cleared pasted and URL files.");
	};

	const listFiles = async () => {
		try {
			setStatusMessage("Loading files...");
			let result: FileRecord[] = [];
			if (SYSTEM_MODE === 0) {
				result = JSON.parse(JSON.stringify(SAMPLE_MOCK_FILES));
			} else {
				const cfg = getConfig();
				const client = getClient(cfg);
				const response = await client.send(
					new ListObjectsV2Command({
						Bucket: cfg.bucket,
						Prefix: cfg.prefix || undefined,
					})
				);
				result = (response.Contents || []).map((item) => ({ ...item, Key: String(item.Key || "") }));
			}
			const visibleFiles = result.filter((item) => !isThumbCacheKey(item.Key));
			setFiles(visibleFiles);
			setSelectedKeys([]);
			setStatusMessage("List updated.", "ok");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setFiles([]);
			setStatusMessage(`List failed: ${message}`, "error");
		}
	};

	useEffect(() => {
		listFiles();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const confirmActionWithText = async (message: string, action: () => Promise<void> | void) => {
		setConfirmText(message);
		setConfirmAction(() => action);
		setShowConfirm(true);
	};

	const handleDeleteSelected = async () => {
		if (!selectedKeys.length) {
			setStatusMessage("Select one or more files to delete.", "error");
			return;
		}
		await confirmActionWithText(`Delete ${selectedKeys.length} selected file${selectedKeys.length === 1 ? "" : "s"}?`, async () => {
			setShowDeleteLoader(true);
			setDeleteLoaderText(`Deleting ${selectedKeys.length} file${selectedKeys.length === 1 ? "" : "s"}...`);
			try {
				if (SYSTEM_MODE === 0) {
					setFiles((prev) => prev.filter((item) => !selectedKeys.includes(item.Key)));
				} else {
					const cfg = getConfig();
					const client = getClient(cfg);
					for (const key of selectedKeys) {
						await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
					}
				}
				setSelectedKeys([]);
				setStatusMessage(`Deleted ${selectedKeys.length} selected file${selectedKeys.length === 1 ? "" : "s"}.`, "ok");
				await listFiles();
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				setStatusMessage(`Delete failed: ${message}`, "error");
			} finally {
				setShowDeleteLoader(false);
				setShowConfirm(false);
			}
		});
	};

	const handleDownloadSelected = async () => {
		if (!selectedKeys.length) {
			setStatusMessage("Select one or more files to download.", "error");
			return;
		}
		try {
			const cfg = getConfig();
			const zip = new JSZip();
			for (let i = 0; i < selectedKeys.length; i++) {
				const key = selectedKeys[i];
				const url = await getDownloadUrl(cfg, key, false);
				const response = await fetch(url);
				if (!response.ok) throw new Error(`Download failed for ${key}: HTTP ${response.status}`);
				const blob = await response.blob();
				zip.file(key, blob);
			}
			const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
			const url = URL.createObjectURL(zipBlob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `selected_${getTimestampForFileName()}.zip`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			setStatusMessage("Download started.", "ok");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setStatusMessage(`Download selected failed: ${message}`, "error");
		}
	};

	const uploadFiles = async () => {
		const selectedItems = getUploadQueue();
		if (!selectedItems.length) {
			setStatusMessage("Please choose files, folder, and/or paste images to upload.", "error");
			return;
		}
		try {
			const targetFolderName = uploadFolderName.trim();
			const uploadBasePrefix = getUploadBasePrefix(settings.prefix, targetFolderName);
			if (SYSTEM_MODE === 0) {
				for (let i = 0; i < selectedItems.length; i++) {
					const file = selectedItems[i];
					const key = getObjectKeyFromFile(file, uploadBasePrefix);
					setFiles((prev) => [...prev, { Key: key, LastModified: new Date(), ETag: `"mock-etag-${Date.now()}-${i}"`, Size: file.size, StorageClass: "STANDARD" }]);
				}
				setStatusMessage(`Upload complete (${selectedItems.length} file${selectedItems.length === 1 ? "" : "s"}).`, "ok");
				if (fileInputRef.current) fileInputRef.current.value = "";
				if (folderInputRef.current) folderInputRef.current.value = "";
				setPastedImages([]);
				setUrlFiles([]);
				setUploadFolderName("");
				await listFiles();
			} else {
				const cfg = getConfig();
				const client = getClient(cfg);
				const total = selectedItems.length;
				const totalBytes = selectedItems.reduce((sum, file) => sum + file.size, 0) || 1;
				let uploadedBytes = 0;
				setUploadProgress({ visible: true, percent: 0, label: "Preparing upload..." });
				for (let i = 0; i < total; i++) {
					const file = selectedItems[i];
					const key = getObjectKeyFromFile(file, uploadBasePrefix);
					const putCommand = new PutObjectCommand({ Bucket: cfg.bucket, Key: key, ContentType: file.type || "application/octet-stream" });
					const putUrl = await getSignedUrl(client, putCommand, { expiresIn: 3600 });
					const xhr = new XMLHttpRequest();
					await new Promise<void>((resolve, reject) => {
						xhr.open("PUT", putUrl, true);
						xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
						xhr.upload.onprogress = (event) => {
							if (event.lengthComputable) {
								const currentTotal = uploadedBytes + Math.min(event.loaded, event.total || file.size);
								const percent = (currentTotal / totalBytes) * 100;
								setUploadProgress({ visible: true, percent, label: `Uploading ${i + 1}/${total}: ${file.name}` });
							}
						};
						xhr.onload = () => {
							if (xhr.status >= 200 && xhr.status < 300) resolve();
							else reject(new Error(`HTTP ${xhr.status} ${xhr.statusText}`));
						};
						xhr.onerror = () => reject(new Error("Network or CORS error during upload."));
						xhr.send(file);
					});
					uploadedBytes += file.size;
					setUploadProgress({ visible: true, percent: (uploadedBytes / totalBytes) * 100, label: `Uploaded ${i + 1}/${total}: ${file.name}` });
				}
				setUploadProgress({ visible: true, percent: 100, label: "Upload complete" });
				setStatusMessage(`Upload complete (${total} file${total === 1 ? "" : "s"}).`, "ok");
				if (fileInputRef.current) fileInputRef.current.value = "";
				if (folderInputRef.current) folderInputRef.current.value = "";
				setPastedImages([]);
				setUrlFiles([]);
				setUploadFolderName("");
				await listFiles();
				setTimeout(() => setUploadProgress((prev) => ({ ...prev, visible: false })), 900);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setStatusMessage(`Upload failed: ${message}`, "error");
			setUploadProgress({ visible: false, percent: 0, label: "Preparing upload..." });
		}
	};

	const getFolderNameTree = (list: FileRecord[]) => {
		const folderSet = new Set<string>();
		for (const item of list) {
			const folderPath = getFolderPathFromKey(item.Key || "");
			if (folderPath && folderPath !== "(root)") folderSet.add(folderPath);
		}
		return Array.from(folderSet).sort((a, b) => a.localeCompare(b));
	};

	useEffect(() => {
		setUploadFolderOptions(getFolderNameTree(files));
	}, [files]);

	const renderTreeNodes = (tree: Record<string, any>, parentPath = "") => {
		const entries = Object.keys(tree).sort((a, b) => a.localeCompare(b));
		if (!entries.length) return null;
		return (
			<ul className={`tree-list ${parentPath ? "tree-children" : ""}`}>
				{entries.map((name) => {
					const fullPath = parentPath ? `${parentPath}/${name}` : name;
					return (
						<li className="tree-item" key={fullPath}>
							<button
								type="button"
								className={`tree-node ${folderFilter === fullPath ? "active" : ""}`}
								onClick={() => browseFolder(fullPath)}
							>
								<span className="tree-icon">📁</span>
								<span>{name}</span>
							</button>
							{renderTreeNodes(tree[name], fullPath)}
						</li>
					);
				})}
			</ul>
		);
	};

	const handleDownloadOne = async (key: string) => {
		try {
			const cfg = getConfig();
			const url = await getDownloadUrl(cfg, key, true);
			window.open(url, "_blank", "noopener,noreferrer");
			setStatusMessage("Signed download link opened.", "ok");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setStatusMessage(`Download failed: ${message}`, "error");
		}
	};

	const handleViewOne = async (key: string) => {
		try {
			const cfg = getConfig();
			const url = await getDownloadUrl(cfg, key, false);
			window.open(url, "_blank", "noopener,noreferrer");
			setStatusMessage("Signed view link opened.", "ok");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setStatusMessage(`View failed: ${message}`, "error");
		}
	};

	const deleteSingleKey = async (key: string) => {
		await confirmActionWithText(`Delete ${key}?`, async () => {
			setShowDeleteLoader(true);
			setDeleteLoaderText(`Deleting ${key}...`);
			try {
				if (SYSTEM_MODE === 0) {
					setFiles((prev) => prev.filter((item) => item.Key !== key));
				} else {
					const cfg = getConfig();
					const client = getClient(cfg);
					await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
				}
				setStatusMessage("File deleted.", "ok");
				await listFiles();
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				setStatusMessage(`Delete failed: ${message}`, "error");
			} finally {
				setShowDeleteLoader(false);
				setShowConfirm(false);
			}
		});
	};

	const handleUploadFolderMenu = (value: string) => {
		const filtered = !value
			? uploadFolderOptions
			: uploadFolderOptions.filter((folderPath) => folderPath.toLowerCase().includes(value.toLowerCase()));
		return filtered;
	};

	useEffect(() => {
		const handleDocumentClick = (event: MouseEvent) => {
			if (uploadFolderSelectRef.current && !uploadFolderSelectRef.current.contains(event.target as Node)) {
				setUploadFolderMenuOpen(false);
			}
		};
		document.addEventListener("click", handleDocumentClick);
		return () => document.removeEventListener("click", handleDocumentClick);
	}, []);

	const selectAllVisible = () => {
		if (selectedKeys.length === filteredFiles.length) {
			setSelectedKeys([]);
		} else {
			setSelectedKeys(filteredFiles.map((item) => item.Key));
		}
	};

	const totalSelected = selectedKeys.length;
	const folderSuggestions = handleUploadFolderMenu(uploadFolderName);
	
	useEffect(() => {
		if (!folderSuggestions.length) {
			setUploadFolderActiveIndex(0);
			return;
		}
		setUploadFolderActiveIndex((prev) => Math.min(prev, folderSuggestions.length - 1));
	}, [folderSuggestions.length]);

	return (
		<div className={`files-wrapper ${embedded ? "embedded" : ""}`}>
			<div className="files-shell" data-embedded={embedded ? "true" : "false"}>
				
				<div className="card">
					<div className="upload-layout">
						<div className="upload-grid">
							<div className="field-card">
								<label htmlFor="files">Select files (multi upload)</label>
								<input id="files" ref={fileInputRef} type="file" multiple />
								<label htmlFor="folderInput" style={{ marginTop: 10 }}>Select folder (upload with folder name)</label>
								<input id="folderInput" ref={folderInputRef} type="file" {...folderInputProps} multiple />
								<label htmlFor="uploadFolderName" style={{ marginTop: 10 }}>Upload Folder Name (target)</label>
								<div ref={uploadFolderSelectRef} className="folder-select">
									<input
										id="uploadFolderName"
										className="folder-select-input"
										type="text"
										placeholder="example: invoices/2026"
										autoComplete="off"
										value={uploadFolderName}
										onChange={(event) => setUploadFolderName(event.target.value)}
										onFocus={() => setUploadFolderMenuOpen(true)}
									/>
									<button
										type="button"
										className="folder-select-toggle secondary"
										title="Show folder suggestions"
										onClick={() => setUploadFolderMenuOpen((prev) => !prev)}
									>
										▼
									</button>
									<div ref={uploadFolderMenuRef} className={`folder-select-menu ${uploadFolderMenuOpen ? "" : "hidden"}`} role="listbox" aria-label="Folder suggestions">
										{folderSuggestions.length ? (
											folderSuggestions.map((folderPath, index) => (
												<button
													type="button"
													key={folderPath}
													className={`folder-option ${index === uploadFolderActiveIndex ? "active" : ""}`}
													onClick={() => {
														setUploadFolderName(folderPath);
														setUploadFolderMenuOpen(false);
													}}
												>
													{folderPath}
												</button>
											))
										) : (
											<div className="folder-option-empty">{uploadFolderOptions.length ? "No matching folders" : "No folders available yet"}</div>
										)}
									</div>
								</div>
								<div className="hint">All selected files will be uploaded inside this folder path.</div>
							</div>
							<div className="field-card">
								<label htmlFor="sourceUrl" style={{ marginTop: 10 }}>Upload from URL</label>
								<div className="url-upload-row">
									<input id="sourceUrl" type="url" placeholder="https://example.com/file.jpg" autoComplete="off" />
									<button type="button" className="secondary" onClick={addFileFromUrl}>Add URL File</button>
								</div>
								<div className="hint">URL must allow CORS to be fetched by browser.</div>
								<div className="paste-zone" tabIndex={0} onPaste={addPastedImagesFromClipboard} onClick={(event) => (event.currentTarget as HTMLDivElement).focus()}>
									Paste image here (Ctrl+V)
								</div>
								<div className="paste-meta">
									<span>Pasted images: {pastedImages.length} | URL files: {urlFiles.length}</span>
									<button type="button" className="secondary small-btn" onClick={clearPastedAndUrlFiles}>Clear</button>
								</div>
							</div>
						</div>
						<div className="upload-submit-row">
							<button type="button" onClick={uploadFiles}>Upload</button>
						</div>
					</div>
					{uploadProgress.visible && (
						<div className="progress-wrap">
							<div className="progress-top">
								<span>{uploadProgress.label}</span>
								<span>{uploadProgress.percent.toFixed(1)}%</span>
							</div>
							<div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(uploadProgress.percent)}>
								<div className="progress-fill" style={{ width: `${uploadProgress.percent}%` }} />
							</div>
						</div>
					)}
				</div>

				<div className="card">
					<div className="list-top-row">
						<div className="list-top-left">
							<span className="pill">{files.length} file{files.length === 1 ? "" : "s"}</span>
						</div>
						<div className="list-top-center">
							<button type="button" className="secondary" onClick={listFiles}>Refresh List</button>
						</div>
						<div className="list-top-right select-tools">
							<button type="button" className={`icon-btn secondary ${showThumbs ? "active" : ""}`} onClick={() => setShowThumbs((prev) => !prev)} title={showThumbs ? "Thumbnails ON — click to disable" : "Thumbnails OFF — click to enable"} aria-label="Toggle thumbnails" aria-pressed={showThumbs}>
								🖼
							</button>
							<button type="button" className={`icon-btn secondary ${galleryViewEnabled ? "active" : ""}`} onClick={() => setGalleryViewEnabled((prev) => !prev)} title={galleryViewEnabled ? "Gallery View ON — click to disable" : "Gallery View OFF — click to enable"} aria-label="Toggle gallery view" aria-pressed={galleryViewEnabled}>
								▦
							</button>
							<button type="button" className="icon-btn secondary" onClick={handleDownloadSelected} title="Download selected files" aria-label="Download selected files" disabled={!totalSelected}>
								⬇
							</button>
							<button type="button" className="icon-btn danger" onClick={handleDeleteSelected} title="Delete selected files" aria-label="Delete selected files" disabled={!totalSelected}>
								🗑
							</button>
						</div>
					</div>
					<div className="search-box">
						<input id="searchKey" ref={searchInputRef} type="text" placeholder="Search files by key name..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
					</div>
					<div className="folder-toolbar">
						<div className="folder-tree-head">
							<span className="folder-tree-title">Folders</span>
							<button type="button" className={`folder-chip ${folderFilter === "(root)" ? "active" : ""}`} onClick={() => setFolderFilter("(root)")}>Root</button>
							<button type="button" className={`folder-chip ${folderFilter === "" ? "active" : ""}`} onClick={() => setFolderFilter("")}>All folders</button>
						</div>
						<div className="folder-tree-wrap">{renderTreeNodes(folderTreeData.tree, "")}</div>
					</div>
					<div className="table-wrap" hidden={galleryViewEnabled}>
						<table>
							<thead>
								<tr>
									<th className="sel-col"><input id="selectAllRows" type="checkbox" title="Select all" aria-label="Select all" checked={filteredFiles.length > 0 && selectedKeys.length === filteredFiles.length} onChange={() => selectAllVisible()} /></th>
									<th style={{ width: "16%" }}>Parent</th>
									<th style={{ width: "20%" }}>Sub-folder</th>
									<th style={{ width: "31%" }}>Key</th>
									<th style={{ width: "15%" }}>Size</th>
									<th style={{ width: 240 }}>Actions</th>
								</tr>
							</thead>
							<tbody>
								{filteredFiles.length ? (
									filteredFiles.map((item) => {
										const folderPath = getFolderPathFromKey(item.Key || "");
										const folderParts = getFolderDisplayParts(folderPath);
										const selected = selectedKeys.includes(item.Key);
										return (
											<tr key={item.Key} data-key={item.Key} data-folder={folderPath}>
												<td className="sel-col"><input type="checkbox" className="row-check" checked={selected} onChange={(event) => handleSelectRow(item.Key, event.currentTarget.checked)} /></td>
												<td className="parent-cell"><button type="button" className="folder-link" onClick={() => browseFolder(folderPath)}>{folderParts.parent}</button></td>
												<td className="subfolder-cell">{folderParts.subfolder}</td>
												<td className="key-cell">
													{isImageKey(item.Key) ? (
														<>
															<div className="thumb-placeholder" style={{ display: showThumbs ? "none" : "flex" }}>🖼️</div>
															<img
																className="thumb"
																alt={item.Key}
																title="Click to preview"
																loading="lazy"
																style={{ display: showThumbs ? "block" : "none" }}
																src=""
																onClick={async () => {
																	try {
																		const cfg = getConfig();
																		const url = await getDownloadUrl(cfg, item.Key, false);
																		setThumbModalSrc(url);
																	} catch {
																		setThumbModalSrc(`data:text/plain,${encodeURIComponent(item.Key)}`);
																	}
																}}
															/>
														</>
													) : (
														<div className="thumb-placeholder">{getFileIcon(item.Key)}</div>
													)}
													<span className="key-text">{item.Key}</span>
												</td>
												<td>{formatBytes(item.Size || 0)}</td>
												<td className="actions-cell"><div className="action-buttons"><button type="button" className="icon-btn secondary" onClick={() => handleViewOne(item.Key)} title="View">👁</button><button type="button" className="icon-btn secondary" onClick={() => handleDownloadOne(item.Key)} title="Download">⬇</button><button type="button" className="icon-btn danger" onClick={() => deleteSingleKey(item.Key)} title="Delete">🗑</button></div></td>
											</tr>
										);
									})
								) : (
									<tr><td colSpan={6} style={{ color: "var(--files-muted)" }}>No files found.</td></tr>
								)}
							</tbody>
							</table>
						</div>
						<div className={`gallery-wrap ${galleryViewEnabled ? "" : "hidden"}`}>
							{filteredFiles.length ? (
								filteredFiles.map((item) => {
									const folderPath = getFolderPathFromKey(item.Key || "");
									const folderParts = getFolderDisplayParts(folderPath);
									return (
										<div className="gallery-card" key={item.Key} data-key={item.Key} data-folder={folderPath}>
											<div className="gallery-head">
												<input type="checkbox" className="row-check" checked={selectedKeys.includes(item.Key)} onChange={(event) => handleSelectRow(item.Key, event.currentTarget.checked)} />
												<span className="gallery-size">{formatBytes(item.Size || 0)}</span>
											</div>
											<div>
												{isImageKey(item.Key) ? (
													<div className="thumb-placeholder" style={{ display: showThumbs ? "none" : "flex" }}>🖼️</div>
												) : (
													<div className="thumb-placeholder">{getFileIcon(item.Key)}</div>
												)}
											</div>
											<div className="gallery-key">{item.Key}</div>
											<div className="gallery-meta">Parent: {folderParts.parent}<br />Sub-folder: {folderParts.subfolder}</div>
											<div className="action-buttons">
												<button type="button" className="icon-btn secondary" onClick={() => handleViewOne(item.Key)} title="View">👁</button>
												<button type="button" className="icon-btn secondary" onClick={() => handleDownloadOne(item.Key)} title="Download">⬇</button>
												<button type="button" className="icon-btn danger" onClick={() => deleteSingleKey(item.Key)} title="Delete">🗑</button>
											</div>
										</div>
									);
								})
							) : <div className="gallery-empty">No files found.</div>}
						</div>
				</div>

				<div className="card">
					<div className="card-head">
						<h2>Connection Settings</h2>
						<button type="button" className="toggle-btn secondary" aria-expanded={false} onClick={() => document.getElementById("configBody")?.classList.toggle("hidden")}>v</button>
					</div>
					<div id="configBody" className="hidden">
						<div className="compact-links">
							<button type="button" className="secondary small-btn" onClick={() => window.open("/clipboard", "_blank", "noopener,noreferrer")}>clipboard</button>
							<button type="button" className="secondary small-btn" onClick={() => window.open("/text-ai", "_blank", "noopener,noreferrer")}>text-ai</button>
							<button type="button" className="secondary small-btn" onClick={() => window.open("/flux-image", "_blank", "noopener,noreferrer")}>flux-image</button>
							<button type="button" className="secondary small-btn" onClick={() => window.open("/image-prompt", "_blank", "noopener,noreferrer")}>image-prompt</button>
						</div>
						<div className="form-grid">
							<div className="field-card">
								<label htmlFor="endpoint">S3 Endpoint</label>
								<input id="endpoint" type="text" value={settings.endpoint} onChange={(event) => setSettings((prev) => ({ ...prev, endpoint: event.target.value }))} />
							</div>
							<div className="field-card">
								<label htmlFor="bucket">Bucket Name</label>
								<input id="bucket" type="text" value={settings.bucket} onChange={(event) => setSettings((prev) => ({ ...prev, bucket: event.target.value }))} />
							</div>
							<div className="field-card">
								<label htmlFor="region">Region</label>
								<input id="region" type="text" value={settings.region} onChange={(event) => setSettings((prev) => ({ ...prev, region: event.target.value }))} />
							</div>
							<div className="field-card">
								<label htmlFor="prefix">Folder / Prefix (optional)</label>
								<input id="prefix" type="text" placeholder="example: reports/" value={settings.prefix} onChange={(event) => setSettings((prev) => ({ ...prev, prefix: event.target.value }))} />
							</div>
							<div className="field-card">
								<label htmlFor="accessKey">R2 Access Key ID (S3 Access Id)</label>
								<input id="accessKey" type="text" value={settings.accessKey} onChange={(event) => setSettings((prev) => ({ ...prev, accessKey: event.target.value }))} />
							</div>
							<div className="field-card">
								<label htmlFor="secretKey">R2 Secret Access Key (S3 Secret)</label>
								<input id="secretKey" type="password" value={settings.secretKey} onChange={(event) => setSettings((prev) => ({ ...prev, secretKey: event.target.value }))} />
							</div>
						</div>
						<div className="hint">
							Browser upload needs CORS on R2 bucket and temporarily uses your keys in browser.
							For production, use a backend that returns pre-signed URLs. Cloudflare API token (cfat_) is not used for S3 upload/list/download.
						</div>
					</div>
					<div id="status" className={statusKind === "error" ? "error" : statusKind === "ok" ? "ok" : ""}>{status || ""}</div>
				</div>				

				<div className={`modal-backdrop ${showConfirm ? "" : "hidden"}`} role="dialog" aria-modal="true">
					<div className="modal-box">
						<h3 className="modal-title">Confirm Action</h3>
						<p className="modal-text">{confirmText}</p>
						<div className="modal-actions">
							<button type="button" className="secondary" onClick={() => setShowConfirm(false)}>Cancel</button>
							<button type="button" className="danger" onClick={() => { if (confirmAction) { void confirmAction(); } }}>Confirm</button>
						</div>
					</div>
				</div>

				<div className={`delete-loader ${showDeleteLoader ? "" : "hidden"}`} aria-live="polite" aria-busy="true">
					<div className="loader-box">
						<div className="spinner" aria-hidden="true" />
						<span>{deleteLoaderText}</span>
					</div>
				</div>

				<div className={`thumb-modal-backdrop ${thumbModalSrc ? "" : "hidden"}`} onClick={() => setThumbModalSrc(null)}>
					<img className="thumb-modal-img" src={thumbModalSrc || ""} alt="Preview" />
				</div>
			</div>
		</div>
	);
}
