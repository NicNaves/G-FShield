module.exports = {
    testEnvironment: "jest-environment-jsdom",
    setupFilesAfterEnv: ["<rootDir>/setupTests.js"],
    moduleNameMapper: {
      "\\.(css|less|scss|sass)$": "identity-obj-proxy", // Mock para estilos
      "^@/(.*)$": "<rootDir>/src/$1", // Alias para '@'
      "^components/(.*)$": "<rootDir>/src/components/$1", // Alias para 'components'
      "^context$": "<rootDir>/src/context", // Alias para 'context'
      "^examples/(.*)$": "<rootDir>/src/examples/$1", // Alias para 'examples'
      "^assets/(.*)$": "<rootDir>/src/assets/$1" // Alias para 'assets'
      
    },
    transform: {
      "^.+\\.(js|jsx|ts|tsx)$": "babel-jest"
    },
    testMatch: ["**/?(*.)+(spec|test).[jt]s?(x)"]
  };
  