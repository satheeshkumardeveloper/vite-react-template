// src/App.tsx

import { AuthProvider, useAuth } from "./context/AuthContext";
import { Login } from "./components/Login";
import { Dashboard } from "./components/Dashboard";

function AppContent() {
	const { isAuthenticated } = useAuth();
	return isAuthenticated ? <Dashboard /> : <Login />;
}

function App() {
	return (
		<AuthProvider>
			<AppContent />
		</AuthProvider>
	);
}

export default App;
