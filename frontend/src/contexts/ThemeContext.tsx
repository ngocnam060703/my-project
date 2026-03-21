import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ConfigProvider, theme as antdTheme } from "antd";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const lightToken = {
  colorPrimary: "#0d9488",
  colorPrimaryHover: "#0f766e",
  colorPrimaryActive: "#115e59",
  borderRadius: 10,
};

const darkToken = {
  ...lightToken,
  colorPrimary: "#2dd4bf",
  colorPrimaryHover: "#5eead4",
  colorPrimaryActive: "#99f6e4",
};

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("theme") as Theme) || "light");

  useEffect(() => {
    localStorage.setItem("theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  const token = theme === "dark" ? darkToken : lightToken;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <ConfigProvider
        theme={{
          token: { ...token, borderRadius: 10 },
          algorithm: theme === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};
