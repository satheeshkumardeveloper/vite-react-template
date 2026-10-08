// src/App.tsx

import { AuthProvider, useAuth } from "./context/AuthContext";
import { Login } from "./components/Login";
import { Dashboard } from "./components/Dashboard";
import { useEffect, useState } from "react";

function AppContent() {
	const { isAuthenticated } = useAuth();
	const [activeView, setActiveView] = useState<"dashboard" | "image-prompt" | "image-cloud" | "history" | "instruction" | "clipboard">("dashboard");

	useEffect(() => {
		if (!isAuthenticated) {
			setActiveView("dashboard");
		}
	}, [isAuthenticated]);

	if (!isAuthenticated) {
		return <Login />;
	}

	return <Dashboard activeView={activeView} onNavigate={setActiveView} />;
}

function App() {
	return (
		<AuthProvider>
			<AppContent />
		</AuthProvider>
	);
}

export default App;
