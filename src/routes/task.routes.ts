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
  deleteTaskNote,
  updateTaskStatus,
  deleteTask,
  getTags
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

// Notes actions
router.post('/:id/notes', authorize('task', 'edit'), addTaskNote);
router.delete('/:id/notes/:noteId', authorize('task', 'deleteNote'), deleteTaskNote);

export default router;
