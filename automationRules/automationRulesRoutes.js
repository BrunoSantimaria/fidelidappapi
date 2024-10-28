const express = require('express');
const router = express.Router();
const automationRuleController = require('./automationRulesController');
const { verifyToken } = require("../middleware/verifyToken.js");

// Crear una nueva regla
router.post('/', verifyToken, automationRuleController.createRule);

// Obtener todas las reglas de una cuenta
router.get('/', verifyToken, automationRuleController.fetchAccountRules);

// Actualizar una regla
router.put('/:ruleId', verifyToken, automationRuleController.updateRule);

// Eliminar una regla
router.delete('/:ruleId', verifyToken, automationRuleController.deleteRule);

module.exports = router;
