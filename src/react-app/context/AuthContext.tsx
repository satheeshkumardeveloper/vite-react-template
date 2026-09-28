import { createContext, useContext, useState, ReactNode } from "react";

interface AuthContextType {
	isAuthenticated: boolean;
	username: string | null;
	login: (username: string, password: string) => boolean;
	logout: () => void;
}

const AUTH_STORAGE_KEY = "app_auth_session";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
		try {
			const saved = localStorage.getItem(AUTH_STORAGE_KEY);
			return saved ? JSON.parse(saved).isAuthenticated === true : false;
		} catch {
			return false;
		}
	});
	const [username, setUsername] = useState<string | null>(() => {
		try {
			const saved = localStorage.getItem(AUTH_STORAGE_KEY);
			return saved ? JSON.parse(saved).username ?? null : null;
		} catch {
			return null;
		}
	});

	const persistSession = (nextAuthenticated: boolean, nextUsername: string | null) => {
		try {
			localStorage.setItem(
				AUTH_STORAGE_KEY,
				JSON.stringify({
					isAuthenticated: nextAuthenticated,
					username: nextUsername,
				})
			);
		} catch {
			// Ignore storage failures in restricted browser contexts
		}
	};

	const login = (inputUsername: string, inputPassword: string): boolean => {
		// Static credentials
		if (inputUsername === "admin" && inputPassword === "admin") {
			setIsAuthenticated(true);
			setUsername(inputUsername);
			persistSession(true, inputUsername);
			return true;
		}
		return false;
	};

	const logout = () => {
		setIsAuthenticated(false);
		setUsername(null);
		persistSession(false, null);
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
