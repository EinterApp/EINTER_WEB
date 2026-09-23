// Button that signs the current user out via AuthContext's logout().
// className/children let callers (e.g. NavBar's profile dropdown) restyle
// it to match their surrounding UI instead of duplicating the sign-out logic.
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";

interface LogoutButtonProps {
  className?: string;
  children?: ReactNode;
  onLoggedOut?: () => void;
}

const LogoutButton = ({ className = "button logout", children = "Log Out", onLoggedOut }: LogoutButtonProps) => {
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      onLoggedOut?.();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <button onClick={handleLogout} className={className}>
      {children}
    </button>
  );
};

export default LogoutButton;