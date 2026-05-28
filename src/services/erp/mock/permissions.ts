import {
  mockPermissions, mockRoles, mockInitialMatrix,
} from "@/data/permissionsMockData";
import type { PermissionsProvider } from "../providers";
import type { PermissionMatrix } from "../types";

const delay = (ms = 120) => new Promise(r => setTimeout(r, ms));

let _matrix: PermissionMatrix = { ...mockInitialMatrix };

export const mockPermissionsProvider: PermissionsProvider = {
  async listPermissions() { await delay(); return [...mockPermissions]; },
  async listRoles()       { await delay(); return [...mockRoles]; },
  async getMatrix()       { await delay(); return JSON.parse(JSON.stringify(_matrix)); },
  async saveMatrix(m)     { await delay(200); _matrix = JSON.parse(JSON.stringify(m)); },
};
