const express = require("express");
const mockDataStore = require("../data/mockDataStore");

const router = express.Router();

router.post("/login", (req, res) => {
  const { email } = req.body || {};
  return res.status(200).json(mockDataStore.createLoginResponse(email));
});

router.post("/register", (req, res) => {
  const user = mockDataStore.createUser(req.body || {});
  return res.status(201).json(user);
});

router.get("/users", (req, res) => {
  return res.status(200).json(mockDataStore.listUsers());
});

router.get("/users/:id", (req, res) => {
  const user = mockDataStore.getUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: "Usuario nao encontrado." });
  }

  return res.status(200).json(user);
});

router.put("/users/:id", (req, res) => {
  const user = mockDataStore.updateUser(req.params.id, req.body || {});
  if (!user) {
    return res.status(404).json({ error: "Usuario nao encontrado." });
  }

  return res.status(200).json(user);
});

module.exports = router;
