import { useAuth } from "../context/AuthContext";
import "../styles/Dashboard.css";

const navSections = [
	{
		label: "Overview",
		items: [
			{ name: "Dashboard", active: true },
			{ name: "Analytics" },
			{ name: "Reports" },
		],
	},
	{
		label: "Manage",
		items: [
			{ name: "Users" },
			{ name: "Teams" },
			{ name: "Permissions" },
		],
	},
	{
		label: "Settings",
		items: [
			{ name: "Profile" },
			{ name: "Security" },
			{ name: "Billing" },
		],
	},
];

export function Dashboard() {
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
					<button type="button" className="nav-item nav-item--active">
						<span>Home</span>
					</button>
					<div className="nav-item nav-item--dropdown">
						<button type="button" className="nav-trigger">
							<span>Products</span>
						</button>
						<div className="dropdown-panel">
							{navSections.map((section) => (
								<div key={section.label} className="dropdown-section">
									<span className="dropdown-title">{section.label}</span>
									{section.items.map((item) => (
										<button
											key={item.name}
											type="button"
											className={item.active ? "dropdown-link active" : "dropdown-link"}
										>
											{item.name}
										</button>
									))}
								</div>
							))}
						</div>
					</div>
					<button type="button" className="nav-item">
						<span>Resources</span>
					</button>
					<button type="button" className="nav-item">
						<span>Pricing</span>
					</button>
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
				<button type="button" className="mobile-nav-button">
					Menu
				</button>
			</div>

			<div className="dashboard-content">
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
			</div>
		</div>
	);
}
