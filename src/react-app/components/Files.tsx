type FilesProps = {
	embedded?: boolean;
};

export function Files({ embedded }: FilesProps) {
	return (
		<div className={`files-wrapper ${embedded ? "embedded" : ""}`}>
			<iframe
				src="/static-workers/index.html"
				title="Files"
				style={{
					width: "100%",
					height: "100%",
					minHeight: "100vh",
					border: "none",
					display: "block",
				}}
			/>
		</div>
	);
}
