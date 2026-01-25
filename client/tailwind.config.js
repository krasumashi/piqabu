/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
    theme: {
        extend: {
            colors: {
                void: "#0F1114",
                signal: "#00FF9D",
                destruct: "#FF453A",
                amber: "#FFB800",
                ghost: "#333333",
            },
            fontFamily: {
                mono: ["SpaceMono"],
            },
        },
    },
    plugins: [],
};
