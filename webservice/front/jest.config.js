module.exports = {
    testEnvironment: "jest-environment-jsdom",
    setupFilesAfterEnv: ["<rootDir>/src/setupTests.js"],
    moduleNameMapper: {
      "\\.(css|less|scss|sass)$": "identity-obj-proxy", // Mock para estilos
      "^@/(.*)$": "<rootDir>/src/$1", // Alias para '@'
      "^components/(.*)$": "<rootDir>/src/components/$1", // Alias para 'components'
      "^context$": "<rootDir>/src/context", // Alias para 'context'
      "^examples/(.*)$": "<rootDir>/src/examples/$1", // Alias para 'examples'
      "^assets/(.*)$": "<rootDir>/src/assets/$1", // Alias para 'assets'
      "^hooks/(.*)$": "<rootDir>/src/hooks/$1",
      "^api/(.*)$": "<rootDir>/src/api/$1",
      "^utils/(.*)$": "<rootDir>/src/utils/$1",
      "^data/(.*)$": "<rootDir>/src/data/$1",
      "^layouts/(.*)$": "<rootDir>/src/layouts/$1",
      "^i18n$": "<rootDir>/src/i18n"
      
    },
    transform: {
      "^.+\\.(js|jsx|ts|tsx)$": "babel-jest"
    },
    testMatch: ["**/?(*.)+(spec|test).[jt]s?(x)"]
  };
  
