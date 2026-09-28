import { createContext, useContext, useState, ReactNode } from "react";

interface AuthContextType {
	isAuthenticated: boolean;
	username: string | null;
	login: (username: string, password: string) => boolean;
	logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [username, setUsername] = useState<string | null>(null);

	const login = (inputUsername: string, inputPassword: string): boolean => {
		// Static credentials
		if (inputUsername === "admin" && inputPassword === "admin") {
			setIsAuthenticated(true);
			setUsername(inputUsername);
			return true;
		}
		return false;
	};

	const logout = () => {
		setIsAuthenticated(false);
		setUsername(null);
	};

	return (
		<AuthContext.Provider value={{ isAuthenticated, username, login, logout }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within AuthProvider");
	}
	return context;
}
