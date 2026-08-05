"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("@novr/db");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Read-only for now — full badge management (create/edit, auto-award
// triggers) is Phase 6.
router.get("/", auth_1.authenticate, async (_req, res) => {
    const badges = await db_1.prisma.badge.findMany({ orderBy: { name: "asc" } });
    res.json({ badges });
});
exports.default = router;
