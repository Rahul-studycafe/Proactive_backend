import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  toggleChecklistStep,
  addTaskNote,
  updateTaskStatus,
  deleteTask,
  getTags,
  getTaskHistory,
  deleteTaskNote,
  addTaskChecklistStep,
  deleteTaskChecklistStep,
  addSubtask,
  updateSubtask,
  deleteSubtask
} from '../controllers/task.controller';

const router = Router();

// Protect all task routes
router.use(authenticate);

// List tasks (requires view permission)
router.get('/', authorize('task', 'view'), getTasks);

// Get tags (requires view permission)
router.get('/tags/all', authorize('task', 'view'), getTags);

// Get single task (requires view permission)
router.get('/:id', authorize('task', 'view'), getTaskById);

// Create task (requires create permission)
router.post('/', authorize('task', 'create'), createTask);

// Update task (requires edit permission)
router.put('/:id', authorize('task', 'edit'), updateTask);

// Update task status (quick toggle)
router.patch('/:id/status', authorize('task', 'edit'), updateTaskStatus);

// Delete task
router.delete('/:id', authorize('task', 'delete'), deleteTask);

// Checklist actions
router.patch('/:id/checklist/:stepIndex', authorize('task', 'edit'), toggleChecklistStep);
router.post('/:id/checklist', authorize('task', 'edit'), addTaskChecklistStep);
router.delete('/:id/checklist/:stepIndex', authorize('task', 'edit'), deleteTaskChecklistStep);

// Subtask actions
router.post('/:id/subtasks', authorize('task', 'edit'), addSubtask);
router.put('/:id/subtasks/:subtaskId', authorize('task', 'edit'), updateSubtask);
router.delete('/:id/subtasks/:subtaskId', authorize('task', 'edit'), deleteSubtask);

// Notes and History actions
router.get('/:id/history', authorize('task', 'view'), getTaskHistory);
router.post('/:id/notes', authorize('task', 'edit'), addTaskNote);
router.delete('/:id/notes/:noteId', authorize('task', 'deleteNote'), deleteTaskNote);

export default router;
