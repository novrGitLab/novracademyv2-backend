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
const groupService = __importStar(require("../services/groupService"));
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get("/", async (req, res) => {
    const parsed = zod_1.z
        .object({ type: zod_1.z.nativeEnum(types_1.GroupType).optional(), includeArchived: zod_1.z.coerce.boolean().optional() })
        .safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const isAdmin = types_1.ADMIN_ROLES.includes(req.user.role);
    const groups = await groupService.listGroups({
        type: parsed.data.type,
        viewerId: req.user.id,
        includeArchived: isAdmin && parsed.data.includeArchived,
    });
    res.json({ groups });
});
router.get("/:id", async (req, res) => {
    const group = await groupService.getGroupById(req.params.id);
    if (!group)
        return res.status(404).json({ error: "Group not found" });
    res.json(group);
});
const createGroupSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    type: zod_1.z.nativeEnum(types_1.GroupType),
    courseId: zod_1.z.string().optional(),
    cohortId: zod_1.z.string().optional(),
});
router.post("/", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const parsed = createGroupSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const group = await groupService.createGroup(parsed.data);
    res.status(201).json(group);
});
const updateGroupSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    description: zod_1.z.string().optional(),
    isArchived: zod_1.z.boolean().optional(),
    isPinned: zod_1.z.boolean().optional(),
});
router.patch("/:id", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    const parsed = updateGroupSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const group = await groupService.updateGroup(req.params.id, parsed.data);
    res.json(group);
});
router.delete("/:id", (0, auth_1.requireRole)(...types_1.ADMIN_ROLES), async (req, res) => {
    await groupService.deleteGroup(req.params.id);
    res.status(204).send();
});
router.post("/:id/join", async (req, res) => {
    const membership = await groupService.joinGroup(req.user.id, req.params.id);
    res.status(201).json(membership);
});
router.post("/:id/leave", async (req, res) => {
    await groupService.leaveGroup(req.user.id, req.params.id);
    res.status(204).send();
});
exports.default = router;
