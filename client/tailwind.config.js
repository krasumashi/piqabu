/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
    theme: {
        extend: {
            colors: {
                void: "#0F1114",
                signal: "#FFFFFF",
                destruct: "#555555",
                amber: "#888888",
                ghost: "#333333",
            },
            fontFamily: {
                mono: ["SpaceMono"],
            },
        },
    },
    plugins: [],
};
