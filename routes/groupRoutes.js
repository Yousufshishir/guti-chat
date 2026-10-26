const express = require('express');
// 👈 নতুন যোগ করা হলো: নতুন কন্ট্রোলারগুলো ইমপোর্ট করা
const { 
  createGroup, 
  leaveGroup, 
  rotateGroupKeys,
  getUserGroups,
  getGroupDetails,
  addGroupMember,
  removeGroupMember,
  editGroup // 👈 নতুন যোগ করা হলো: editGroup ইমপোর্ট
} = require('../controllers/groupController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// 👈 নতুন যোগ করা হলো: Group Management Routes
router.get('/', getUserGroups);
router.get('/:id', getGroupDetails);

// 👈 নতুন যোগ করা হলো: Edit Group Name/Icon রাউট
router.put('/:id', editGroup);

// আগের রাউটগুলো অক্ষত আছে
router.post('/create', createGroup);
router.put('/:id/leave', leaveGroup);
router.put('/:id/rotate-keys', rotateGroupKeys);

// 👈 নতুন যোগ করা হলো: Member Management Routes
router.put('/:id/add-member', addGroupMember);
router.delete('/:id/remove-member/:userId', removeGroupMember);

module.exports = router;