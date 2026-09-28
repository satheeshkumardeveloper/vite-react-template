import { useAuth } from "../context/AuthContext";
import "../styles/Dashboard.css";

export function Dashboard() {
	const { logout, username } = useAuth();

	const handleLogout = () => {
		logout();
	};

	return (
		<div className="dashboard-container">
			<div className="dashboard-header">
				<h1>Welcome to Dashboard</h1>
				<div className="user-info">
					<span>Logged in as: <strong>{username}</strong></span>
					<button onClick={handleLogout} className="logout-button">
						Logout
					</button>
				</div>
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
