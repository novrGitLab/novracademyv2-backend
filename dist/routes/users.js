"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const types_1 = require("@novr/types");
const auth_1 = require("../middleware/auth");
const userService = __importStar(require("../services/userService"));
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const listQuerySchema = zod_1.z.object({
    role: zod_1.z.nativeEnum(types_1.UserRole).optional(),
    memberType: zod_1.z.nativeEnum(types_1.MemberType).optional(),
    status: zod_1.z.nativeEnum(types_1.UserStatus).optional(),
    search: zod_1.z.string().optional(),
    page: zod_1.z.coerce.number().int().positive().optional(),
    pageSize: zod_1.z.coerce.number().int().positive().optional(),
});
// GET /users — admins/managers only (managers browsing their org).
router.get("/", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES, types_1.UserRole.MANAGER), async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const result = await userService.listUsers(parsed.data);
    res.json(result);
});
// GET /users/lookup?email=... — any authenticated member, exact match only
// (see userService.lookupUserByEmail) — used to start a DM with someone.
router.get("/lookup", async (req, res) => {
    const parsed = zod_1.z.object({ email: zod_1.z.string().email() }).safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const user = await userService.lookupUserByEmail(parsed.data.email);
    if (!user)
        return res.status(404).json({ error: "No member found with that email" });
    res.json(user);
});
// GET /users/:id — self, or admins/managers.
router.get("/:id", async (req, res) => {
    const isSelf = req.user.id === req.params.id;
    const isPrivileged = [...types_1.ADMIN_ROLES, types_1.UserRole.MANAGER].includes(req.user.role);
    if (!isSelf && !isPrivileged) {
        return res.status(403).json({ error: "Insufficient permissions" });
    }
    const user = await userService.getUserById(req.params.id);
    if (!user)
        return res.status(404).json({ error: "User not found" });
    res.json(user);
});
const createUserSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    name: zod_1.z.string().min(1).optional(),
    role: zod_1.z.nativeEnum(types_1.UserRole).optional(),
    memberType: zod_1.z.nativeEnum(types_1.MemberType).optional(),
    managerId: zod_1.z.string().optional(),
    password: zod_1.z.string().min(8).optional(),
});
// POST /users — admins only.
router.post("/", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const user = await userService.createUser(parsed.data);
    res.status(201).json(user);
});
const updateUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    role: zod_1.z.nativeEnum(types_1.UserRole).optional(),
    memberType: zod_1.z.nativeEnum(types_1.MemberType).optional(),
    status: zod_1.z.nativeEnum(types_1.UserStatus).optional(),
    managerId: zod_1.z.string().nullable().optional(),
    bio: zod_1.z.string().optional(),
    location: zod_1.z.string().optional(),
    openToWork: zod_1.z.boolean().optional(),
});
// PATCH /users/:id — self may edit profile fields; only admins may change role/status.
router.patch("/:id", async (req, res) => {
    const isSelf = req.user.id === req.params.id;
    const isAdmin = types_1.ADMIN_ROLES.includes(req.user.role);
    if (!isSelf && !isAdmin) {
        return res.status(403).json({ error: "Insufficient permissions" });
    }
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { role, status, managerId, ...profileFields } = parsed.data;
    if ((role || status || managerId !== undefined) && !isAdmin) {
        return res.status(403).json({ error: "Only admins can change role, status, or manager" });
    }
    const cleanData = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== null));
    const user = await userService.updateUser(req.params.id, cleanData);
    res.json(user);
});
// DELETE /users/:id — super/org admins only.
router.delete("/:id", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    await userService.deleteUser(req.params.id);
    res.status(204).send();
});
exports.default = router;
