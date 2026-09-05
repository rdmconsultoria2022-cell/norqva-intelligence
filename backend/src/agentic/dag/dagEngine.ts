import { TaskStatus } from '../contracts/agentContract';

export interface DAGTaskNode {
  task_id: string;
  human_id?: string;
  agent_id: string;
  depends_on: string[];
  status: TaskStatus;
  input_payload: any;
  output_payload?: any;
  error_message?: string;
  retry_count: number;
}

export class DAGEngine {
  public static detectCycle(tasks: DAGTaskNode[]): { hasCycle: boolean; cyclePath?: string[] } {
    const idMap = new Map<string, string>(); // maps both task_id and human_id to task_id
    tasks.forEach(t => {
      idMap.set(t.task_id, t.task_id);
      if (t.human_id) {
        idMap.set(t.human_id, t.task_id);
      }
    });

    const adj = new Map<string, string[]>();
    tasks.forEach(t => {
      const canonicalDeps: string[] = [];
      for (const dep of (t.depends_on || [])) {
        const targetId = idMap.get(dep);
        if (targetId) {
          canonicalDeps.push(targetId);
        }
      }
      adj.set(t.task_id, canonicalDeps);
    });

    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: string, path: string[]): boolean => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = adj.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, path)) return true;
        } else if (recursionStack.has(neighbor)) {
          path.push(neighbor);
          return true;
        }
      }

      recursionStack.delete(node);
      path.pop();
      return false;
    };

    for (const task of tasks) {
      if (!visited.has(task.task_id)) {
        const path: string[] = [];
        if (dfs(task.task_id, path)) {
          return { hasCycle: true, cyclePath: path };
        }
      }
    }

    return { hasCycle: false };
  }

  public static getNextExecutableTasks(tasks: DAGTaskNode[]): DAGTaskNode[] {
    const taskMap = new Map<string, DAGTaskNode>();
    tasks.forEach(t => {
      taskMap.set(t.task_id, t);
      if (t.human_id) {
        taskMap.set(t.human_id, t);
      }
    });

    return tasks.filter(task => {
      if (task.status !== 'PENDING') return false;

      // Check all dependencies
      for (const depId of (task.depends_on || [])) {
        const dep = taskMap.get(depId);
        if (!dep || dep.status !== 'COMPLETED') {
          return false;
        }
      }
      return true;
    });
  }

  public static cascadeBlockedTasks(tasks: DAGTaskNode[]): DAGTaskNode[] {
    const taskMap = new Map<string, DAGTaskNode>();
    tasks.forEach(t => {
      taskMap.set(t.task_id, t);
      if (t.human_id) {
        taskMap.set(t.human_id, t);
      }
    });

    let changed = true;
    while (changed) {
      changed = false;
      for (const task of tasks) {
        if (task.status === 'PENDING') {
          for (const depId of (task.depends_on || [])) {
            const dep = taskMap.get(depId);
            if (!dep || dep.status === 'FAILED' || dep.status === 'BLOCKED') {
              task.status = 'BLOCKED';
              task.error_message = `Cascaded block: Dependency "${depId}" is ${dep ? dep.status : 'MISSING'}`;
              changed = true;
              break;
            }
          }
        }
      }
    }
    return tasks;
  }
}
