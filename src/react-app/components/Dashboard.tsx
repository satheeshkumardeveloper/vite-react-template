import { useAuth } from "../context/AuthContext";
import { ImageCloud } from "./ImageCloud";
import { ImagePrompt } from "./ImagePrompt";
import { ImagePromptHistory } from "./ImagePromptHistory";
import { InstructionManagement } from "./InstructionManagement";
import { Clipboard } from "./Clipboard";
import { Files } from "./Files";
import { AIChat } from "./AIChat";
import "../styles/Dashboard.css";

type DashboardProps = {
	activeView: "dashboard" | "image-prompt" | "image-cloud" | "history" | "instruction" | "clipboard" | "files" | "ai-chat";
	onNavigate: (view: "dashboard" | "image-prompt" | "image-cloud" | "history" | "instruction" | "clipboard" | "files" | "ai-chat") => void;
};

export function Dashboard({ activeView, onNavigate }: DashboardProps) {
	const { logout } = useAuth();

	const handleLogout = () => {
		logout();
	};

	return (
		<div className="dashboard-container">
			<header className="dashboard-header">
				<div className="brand-block">
					<div className="brand-mark">U</div>
					<div>
						<span className="eyebrow">Workspace</span>
						<h1>Welcome</h1>
					</div>
				</div>

				<nav className="mega-menu" aria-label="Main navigation">
					<button
						type="button"
						className={activeView === "dashboard" ? "nav-item nav-item--active" : "nav-item"}
						onClick={() => onNavigate("dashboard")}
					>
						<span>Home</span>
					</button>
					<button
						type="button"
						className={activeView === "image-prompt" ? "nav-item nav-item--active" : "nav-item"}
						onClick={() => onNavigate("image-prompt")}
					>
						<span>G-Prompt</span>
					</button>
					<button
						type="button"
						className={activeView === "image-cloud" ? "nav-item nav-item--active" : "nav-item"}
						onClick={() => onNavigate("image-cloud")}
					>
						<span>CloudFlare</span>
					</button>
					<button
						type="button"
						className={activeView === "ai-chat" ? "nav-item nav-item--active" : "nav-item"}
						onClick={() => onNavigate("ai-chat")}
					>
						<span>AI-Chat</span>
					</button>
					<button
						type="button"
						className={activeView === "history" ? "nav-item nav-item--active" : "nav-item"}
						onClick={() => onNavigate("history")}
					>
						<span>History</span>
					</button>
					<button
						type="button"
						className={activeView === "files" ? "nav-item nav-item--active" : "nav-item"}
						onClick={() => onNavigate("files")}
					>
						<span>Files</span>
					</button>
					<button
						type="button"
						className={activeView === "clipboard" ? "nav-item nav-item--active" : "nav-item"}
						onClick={() => onNavigate("clipboard")}
					>
						<span>Clipboard</span>
					</button>
					<div className="nav-item nav-item--dropdown">
						<button type="button" className="nav-trigger">
							<span>Master</span>
						</button>
						<div className="dropdown-panel">
							<div className="dropdown-section">
								<button
									type="button"
									className="dropdown-link"
									onClick={() => onNavigate("instruction")}
								>
									Instruction Management
								</button>
							</div>
						</div>
					</div>
				</nav>

				<div className="user-info">
					<button onClick={handleLogout} className="logout-button">
						Logout
					</button>
				</div>
			</header>

			<div className="mobile-nav" aria-label="Mobile navigation">
				<button type="button" className="mobile-nav-button" onClick={() => onNavigate("dashboard")}>
					Home
				</button>
				<button type="button" className={activeView === "image-prompt" ? "mobile-nav-button mobile-nav-button--active" : "mobile-nav-button"} onClick={() => onNavigate("image-prompt")}>
					G-Prompt
				</button>
				<button type="button" className={activeView === "image-cloud" ? "mobile-nav-button mobile-nav-button--active" : "mobile-nav-button"} onClick={() => onNavigate("image-cloud")}>
					CloudFlare
				</button>
				<button type="button" className={activeView === "ai-chat" ? "mobile-nav-button mobile-nav-button--active" : "mobile-nav-button"} onClick={() => onNavigate("ai-chat")}>
					AI-Chat
				</button>
				<button type="button" className={activeView === "history" ? "mobile-nav-button mobile-nav-button--active" : "mobile-nav-button"} onClick={() => onNavigate("history")}>
					History
				</button>
				<button type="button" className={activeView === "files" ? "mobile-nav-button mobile-nav-button--active" : "mobile-nav-button"} onClick={() => onNavigate("files")}>
					Files
				</button>
				<button type="button" className={activeView === "clipboard" ? "mobile-nav-button mobile-nav-button--active" : "mobile-nav-button"} onClick={() => onNavigate("clipboard")}>
					Clipboard
				</button>
				<button type="button" className={activeView === "instruction" ? "mobile-nav-button mobile-nav-button--active" : "mobile-nav-button"} onClick={() => onNavigate("instruction")}>
					Instruction Management
				</button>
			</div>

			<div className="dashboard-content">
				{activeView === "dashboard" ? (
					<>
						<div className="dashboard-card">
							<h2>Dashboard Content</h2>
							<p>You are now logged in and can access the dashboard.</p>
						</div>
						<div className="dashboard-card">
							<h2>Features</h2>
							<ul>
								<li>Secure authentication</li>
								<li>Session management</li>
								<li>Easy logout</li>
							</ul>
						</div>
					</>
				) : activeView === "image-prompt" ? (
					<div className="dashboard-card dashboard-card--full">
						<ImagePrompt embedded onBackToDashboard={() => onNavigate("dashboard")} />
					</div>
				) : activeView === "image-cloud" ? (
					<div className="dashboard-card dashboard-card--full">
						<ImageCloud embedded onBackToDashboard={() => onNavigate("dashboard")} />
					</div>
				) : activeView === "ai-chat" ? (
					<div className="dashboard-card dashboard-card--full">
						<AIChat embedded onBackToDashboard={() => onNavigate("dashboard")} />
					</div>
			) : activeView === "history" ? (
				<div className="dashboard-card dashboard-card--full">
					<ImagePromptHistory onBackToDashboard={() => onNavigate("dashboard")} embedded />
				</div>
			) : activeView === "instruction" ? (
				<div className="dashboard-card dashboard-card--full">
					<InstructionManagement />
				</div>
			) : activeView === "clipboard" ? (
				<div className="dashboard-card dashboard-card--full">
				<Clipboard embedded />
				</div>
			) : activeView === "files" ? (
				<div className="dashboard-card dashboard-card--full">
					<Files embedded />
				</div>
			) : null}
			</div>
		</div>
	);
}
