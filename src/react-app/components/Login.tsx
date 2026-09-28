import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import "../styles/Auth.css";

export function Login() {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const { login } = useAuth();

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		if (!username || !password) {
			setError("Please enter both username and password");
			return;
		}

		const success = login(username, password);
		if (!success) {
			setError("Invalid username or password");
		}
	};

	return (
		<div className="auth-container">
			<div className="auth-card">
				<h1>Login</h1>
				<form onSubmit={handleSubmit} className="auth-form">
					<div className="form-group">
						<label htmlFor="username">Username:</label>
						<input
							id="username"
							type="text"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							placeholder="admin"
						/>
					</div>
					<div className="form-group">
						<label htmlFor="password">Password:</label>
						<input
							id="password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="admin"
						/>
					</div>
					{error && <div className="error-message">{error}</div>}
					<button type="submit" className="auth-button">
						Login
					</button>
				</form>
				<p className="hint">Demo credentials - Username: admin, Password: admin</p>
			</div>
		</div>
	);
}
