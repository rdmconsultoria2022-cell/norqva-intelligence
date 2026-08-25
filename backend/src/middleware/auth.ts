import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { getDB } from '../db/db';
import { verifySupabaseToken } from '../utils/token';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    auth_user_id: string | null;
    name: string;
    email: string;
    role: string;
    status: string;
    is_demo?: boolean;
  };
}

export function requireRole(allowedRoles: string[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const authMode = process.env.AUTH_MODE || 'demo';
      const isProduction = process.env.NODE_ENV === 'production';
      
      const userIdHeader = req.headers['x-user-id'] as string;
      const userRoleHeader = req.headers['x-user-role'] as string;
      const authHeader = req.headers['authorization'];

      // Safety check: Block spoofing/direct headers in real auth mode or in production
      if (isProduction || authMode === 'real') {
        if (userIdHeader || userRoleHeader) {
          return res.status(403).json({ error: 'Direct simulated authentication headers (spoofing) are blocked in production/real mode.' });
        }
      }

      const pool = await getDB();

      // DEMO Mode (Only in development/testing)
      if (authMode === 'demo' && !isProduction) {
        let user;

        if (authHeader && authHeader.startsWith('Bearer ')) {
          // If bearer token is provided in demo mode, try to verify it
          const token = authHeader.substring(7);
          const decoded = await verifySupabaseToken(token);
          if (decoded && decoded.sub) {
            const userQuery = await pool.query(
              'SELECT id, auth_user_id, name, email, role, status, is_demo FROM users WHERE auth_user_id = $1',
              [decoded.sub]
            );
            if (userQuery.rows.length > 0) {
              user = userQuery.rows[0];
            } else {
              return res.status(403).json({ error: 'User profile does not exist in NORQVA.' });
            }
          }
        }

        if (!user && userIdHeader) {
          const userQuery = await pool.query('SELECT id, auth_user_id, name, email, role, status, is_demo FROM users WHERE id = $1', [userIdHeader]);
          if (userQuery.rows.length > 0) {
            user = userQuery.rows[0];
          }
        }

        if (!user && userRoleHeader) {
          const roleQuery = await pool.query('SELECT id, auth_user_id, name, email, role, status, is_demo FROM users WHERE role = $1 LIMIT 1', [userRoleHeader]);
          if (roleQuery.rows.length > 0) {
            user = roleQuery.rows[0];
          } else {
            // Fallback mock user for roles
            user = {
              id: '00000000-0000-0000-0000-000000000000',
              auth_user_id: '00000000-0000-0000-0000-000000000000',
              name: `Mock ${userRoleHeader} User`,
              email: `${userRoleHeader.toLowerCase()}@mock.norqva.com`,
              role: userRoleHeader,
              status: 'ACTIVE',
              is_demo: true
            };
          }
        }

        if (!user) {
          return res.status(401).json({ error: 'Authentication required. Active session token or demo role header is missing.' });
        }

        if (user.status !== 'ACTIVE') {
          return res.status(403).json({ error: 'User account is inactive.' });
        }

        req.user = user;
      } else {
        // REAL Mode (Supabase Auth verified JWT)
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Authentication token required.' });
        }

        const token = authHeader.substring(7);
        const decoded = await verifySupabaseToken(token);
        
        if (!decoded || !decoded.sub) {
          return res.status(401).json({ error: 'Session expired or invalid token.' });
        }

        // Query profile from database
        const userQuery = await pool.query(
          'SELECT id, auth_user_id, name, email, role, status, is_demo FROM users WHERE auth_user_id = $1',
          [decoded.sub]
        );

        if (userQuery.rows.length === 0) {
          return res.status(403).json({ error: 'User profile does not exist in NORQVA.' });
        }

        const user = userQuery.rows[0];

        if (user.status !== 'ACTIVE') {
          return res.status(403).json({ error: 'User account is inactive.' });
        }

        req.user = user;
      }

      // Check RBAC permissions
      const userRole = req.user?.role;
      if (!userRole) {
        return res.status(403).json({ error: 'User has no assigned role.' });
      }

      if (userRole === 'ADMIN') {
        return next();
      }

      if (allowedRoles.includes(userRole)) {
        return next();
      }

      return res.status(403).json({ error: `Forbidden: Role '${userRole}' has insufficient privileges.` });
    } catch (err) {
      console.error('Auth middleware validation error:', err);
      return res.status(500).json({ error: 'Internal server authorization check failed.' });
    }
  };
}
