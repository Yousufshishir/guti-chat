const express = require('express');
const { addComment, getComments, editComment, deleteComment } = require('../controllers/commentController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/:postId')
  .post(addComment)
  .get(getComments);

router.route('/:commentId')
  .put(editComment)
  .delete(deleteComment);

module.exports = router;