/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      minHeight: {
        touch: "48px",
        glove: "64px",
      },
    },
  },
  plugins: [],
};
