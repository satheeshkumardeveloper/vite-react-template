import { useAuth } from "../context/AuthContext";
import { ImageCloud } from "./ImageCloud";
import { ImagePrompt } from "./ImagePrompt";
import { ImagePromptHistory } from "./ImagePromptHistory";
import { InstructionManagement } from "./InstructionManagement";
import "../styles/Dashboard.css";

type DashboardProps = {
	activeView: "dashboard" | "image-prompt" | "image-cloud" | "history" | "instruction";
	onNavigate: (view: "dashboard" | "image-prompt" | "image-cloud" | "history" | "instruction") => void;
};

export function Dashboard({ activeView, onNavigate }: DashboardProps) {
	const { logout, username } = useAuth();

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
						<h1>Welcome to Dashboard</h1>
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
						<span>Image Prompt</span>
					</button>
					<button
						type="button"
						className={activeView === "image-cloud" ? "nav-item nav-item--active" : "nav-item"}
						onClick={() => onNavigate("image-cloud")}
					>
						<span>Image Cloud</span>
					</button>
					<button
						type="button"
						className={activeView === "history" ? "nav-item nav-item--active" : "nav-item"}
						onClick={() => onNavigate("history")}
					>
						<span>History</span>
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
					<span>
						Logged in as: <strong>{username}</strong>
					</span>
					<button onClick={handleLogout} className="logout-button">
						Logout
					</button>
				</div>
			</header>

			<div className="mobile-nav" aria-label="Mobile navigation">
				<button type="button" className="mobile-nav-button" onClick={() => onNavigate("dashboard")}>
					Menu
				</button>
				<button type="button" className="mobile-nav-button mobile-nav-button--accent" onClick={() => onNavigate("image-prompt")}>
					Image Prompt
				</button>
				<button type="button" className="mobile-nav-button" onClick={() => onNavigate("image-cloud")}>
					Image Cloud
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
			) : activeView === "history" ? (
				<div className="dashboard-card dashboard-card--full">
					<ImagePromptHistory onBackToDashboard={() => onNavigate("dashboard")} embedded />
				</div>
			) : activeView === "instruction" ? (
				<div className="dashboard-card dashboard-card--full">
					<InstructionManagement />
				</div>
			) : null}
			</div>
		</div>
	);
}
