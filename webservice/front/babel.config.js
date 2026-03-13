module.exports = {
    presets: [
      ["@babel/preset-env", { targets: { node: "current" } }], // Suporte para JS moderno
      ["@babel/preset-react", { runtime: "automatic" }],       // Suporte para React com JSX automático
    ],
  };
  