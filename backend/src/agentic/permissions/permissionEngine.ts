import { PermissionLevel } from '../contracts/agentContract';

export class PermissionEngine {
  // Strict maximum ceiling for Foundation 1.0 is LEVEL_0
  public static readonly CURRENT_MAX_PERMITTED_LEVEL = PermissionLevel.LEVEL_0;

  public static isPermissionAllowed(
    requested: PermissionLevel,
    maxCeiling: PermissionLevel = PermissionEngine.CURRENT_MAX_PERMITTED_LEVEL
  ): { allowed: boolean; reason?: string } {
    const levelOrder = [
      PermissionLevel.LEVEL_0,
      PermissionLevel.LEVEL_1,
      PermissionLevel.LEVEL_2,
      PermissionLevel.LEVEL_3,
      PermissionLevel.LEVEL_4
    ];

    const requestedIndex = levelOrder.indexOf(requested);
    const ceilingIndex = levelOrder.indexOf(maxCeiling);

    if (requestedIndex === -1) {
      return { allowed: false, reason: `Unknown permission level: ${requested}` };
    }

    if (requestedIndex > ceilingIndex) {
      return {
        allowed: false,
        reason: `Permission denied: ${requested} exceeds current system ceiling (${maxCeiling}). Foundation 1.0 permits strictly LEVEL_0 (READ_ONLY).`
      };
    }

    return { allowed: true };
  }

  public static validateToolAccess(agentAllowedTools: string[], requestedTool: string): { allowed: boolean; reason?: string } {
    if (!agentAllowedTools.includes(requestedTool)) {
      return {
        allowed: false,
        reason: `Tool execution blocked: "${requestedTool}" is not in agent's allowed_tools whitelist.`
      };
    }
    return { allowed: true };
  }
}
