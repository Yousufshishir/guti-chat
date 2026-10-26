// 👈 নতুন যোগ করা হলো: Message এবং User মডেল ইমপোর্ট
const { Group, Message, User } = require('../models');

// 👈 নতুন যোগ করা হলো: System Message তৈরির হেল্পার ফাংশন
const sendSystemMessage = async (groupId, senderId, textContent, io) => {
  try {
    const message = await Message.create({
      sender: senderId,
      groupId: groupId,
      messageType: 'text',
      content: `[SYSTEM] ${textContent}`,
    });

    if (io) {
      const populatedMessage = await message.populate('sender', 'name username avatarUrl');
      io.to(groupId.toString()).emit('receive-group-message', populatedMessage);
    }
  } catch (error) {
    console.error('Failed to create system message:', error);
  }
};

// @desc    Create a new group
const createGroup = async (req, res, next) => {
  try {
    const { groupName, groupIcon, members, encryptedGroupKeys } = req.body;

    if (!groupName) {
      res.status(400);
      throw new Error('Group name is required');
    }

    const memberSet = new Set(members || []);
    memberSet.add(req.user._id.toString()); 
    const finalMembers = Array.from(memberSet);

    const group = await Group.create({
      groupName,
      groupIcon: groupIcon || '',
      creator: req.user._id,
      members: finalMembers,
      encryptedGroupKeys: encryptedGroupKeys || [], 
    });

    res.status(201).json({
      status: 'success',
      data: group,
    });

    // 👈 নতুন যোগ করা হলো: গ্রুপ তৈরির সিস্টেম মেসেজ
    const io = req.app.get('io');
    await sendSystemMessage(
      group._id, 
      req.user._id, 
      `Group created by ${req.user.name || req.user.username}`, 
      io
    );
  } catch (error) {
    next(error);
  }
};

// @desc    Leave a group
const leaveGroup = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id);
    const userId = req.user._id.toString();

    if (!group) {
      res.status(404);
      throw new Error('Group not found');
    }

    if (!group.members.map(m => m.toString()).includes(userId)) {
      res.status(400);
      throw new Error('You are not a member of this group');
    }

    group.members = group.members.filter((memberId) => memberId.toString() !== userId);
    group.encryptedGroupKeys = group.encryptedGroupKeys.filter((key) => key.user.toString() !== userId);

    if (group.creator.toString() === userId) {
      if (group.members.length > 0) {
        group.creator = group.members[0];
      } else {
        await group.deleteOne();
        return res.status(200).json({ status: 'success', message: 'Group deleted as no members are left' });
      }
    }

    await group.save();

    const io = req.app.get('io');
    if (io && group.members.length > 0) {
      group.members.forEach((memberId) => {
        io.to(memberId.toString()).emit('group-key-rotation-needed', {
          groupId: group._id,
          message: 'A member left the group. Please rotate your E2EE keys automatically.',
        });
      });

      // 👈 নতুন যোগ করা হলো: গ্রুপ ছাড়ার সিস্টেম মেসেজ
      await sendSystemMessage(
        group._id, 
        req.user._id, 
        `${req.user.name || req.user.username} left the group`, 
        io
      );
    }

    res.status(200).json({ status: 'success', message: 'Left group successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Rotate group keys when someone leaves or joins
const rotateGroupKeys = async (req, res, next) => {
  try {
    const { encryptedGroupKeys } = req.body;
    const group = await Group.findById(req.params.id);

    if (!group) {
      res.status(404);
      throw new Error('Group not found');
    }

    const isMember = group.members.some((memberId) => memberId.toString() === req.user._id.toString());
    if (!isMember) {
      res.status(403);
      throw new Error('You are not a member of this group');
    }

    if (group.creator.toString() !== req.user._id.toString()) {
      res.status(403);
      throw new Error('Only the group creator can rotate group keys');
    }

    if (!encryptedGroupKeys || !Array.isArray(encryptedGroupKeys)) {
      res.status(400);
      throw new Error('Valid encryptedGroupKeys array is required');
    }

    group.encryptedGroupKeys = encryptedGroupKeys;
    await group.save();

    const io = req.app.get('io');
    if (io) {
      group.members.forEach((memberId) => {
        io.to(memberId.toString()).emit('group-keys-updated', {
          groupId: group._id,
          encryptedGroupKeys: group.encryptedGroupKeys,
        });
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Group keys rotated successfully. Secure messaging resumed.',
      data: group,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all groups the logged-in user is a member of
const getUserGroups = async (req, res, next) => {
  try {
    const groups = await Group.find({ members: req.user._id })
      .populate('creator', 'name username avatarUrl')
      .populate('members', 'name username avatarUrl')
      .sort({ updatedAt: -1 });

    res.status(200).json({
      status: 'success',
      results: groups.length,
      data: groups,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get specific group details with member list
const getGroupDetails = async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('creator', 'name username avatarUrl')
      .populate('members', 'name username avatarUrl bio isProfileLocked');

    if (!group) {
      return res.status(404).json({ status: 'error', message: 'Group not found' });
    }

    const isMember = group.members.some(
      (memberId) => memberId._id.toString() === req.user._id.toString()
    );

    if (!isMember) {
      return res.status(403).json({ status: 'error', message: 'You are not a member of this group' });
    }

    res.status(200).json({
      status: 'success',
      data: group,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add a new member to the group (Creator only)
const addGroupMember = async (req, res, next) => {
  try {
    const { memberId } = req.body;
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ status: 'error', message: 'Group not found' });
    }

    if (group.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ status: 'error', message: 'Only the group creator can add members' });
    }

    if (!memberId) {
      return res.status(400).json({ status: 'error', message: 'memberId is required' });
    }

    if (group.members.some((m) => m.toString() === memberId)) {
      return res.status(400).json({ status: 'error', message: 'User is already a member of this group' });
    }

    group.members.push(memberId);
    await group.save();

    const io = req.app.get('io');
    if (io) {
      group.members.forEach((m) => {
        io.to(m.toString()).emit('group-key-rotation-needed', {
          groupId: group._id,
          reason: 'A new member was added',
        });
      });
      io.to(memberId.toString()).emit('added-to-group', {
        groupId: group._id,
        groupName: group.groupName,
      });

      // 👈 নতুন যোগ করা হলো: মেম্বার অ্যাড করার সিস্টেম মেসেজ
      const addedUser = await User.findById(memberId);
      const addedName = addedUser ? (addedUser.name || addedUser.username) : 'A user';
      await sendSystemMessage(
        group._id, 
        req.user._id, 
        `${addedName} was added by ${req.user.name || req.user.username}`, 
        io
      );
    }

    res.status(200).json({ status: 'success', message: 'Member added successfully', data: group });
  } catch (error) {
    next(error);
  }
};

// @desc    Remove a member from the group (Creator only)
const removeGroupMember = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ status: 'error', message: 'Group not found' });
    }

    if (group.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ status: 'error', message: 'Only the group creator can remove members' });
    }

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ status: 'error', message: 'Use leave group to remove yourself' });
    }

    if (!group.members.some((m) => m.toString() === userId)) {
      return res.status(400).json({ status: 'error', message: 'User is not a member of this group' });
    }

    group.members = group.members.filter((m) => m.toString() !== userId);
    group.encryptedGroupKeys = group.encryptedGroupKeys.filter(
      (k) => k.user.toString() !== userId
    );
    await group.save();

    const io = req.app.get('io');
    if (io) {
      group.members.forEach((m) => {
        io.to(m.toString()).emit('group-key-rotation-needed', {
          groupId: group._id,
          reason: 'A member was removed',
        });
      });
      io.to(userId).emit('removed-from-group', {
        groupId: group._id,
        groupName: group.groupName,
      });

      // 👈 নতুন যোগ করা হলো: মেম্বার রিমুভ করার সিস্টেম মেসেজ
      const removedUser = await User.findById(userId);
      const removedName = removedUser ? (removedUser.name || removedUser.username) : 'A user';
      await sendSystemMessage(
        group._id, 
        req.user._id, 
        `${removedName} was removed by ${req.user.name || req.user.username}`, 
        io
      );
    }

    res.status(200).json({ status: 'success', message: 'Member removed successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Edit group name or icon (Creator only)
const editGroup = async (req, res, next) => {
  try {
    const { groupName, groupIcon } = req.body;
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ status: 'error', message: 'Group not found' });
    }

    if (group.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ status: 'error', message: 'Only the group creator can edit group details' });
    }

    let systemMessageText = '';
    if (groupName && groupName.trim() !== '' && groupName !== group.groupName) {
      group.groupName = groupName.trim();
      systemMessageText = `Group name was changed to "${group.groupName}" by ${req.user.name || req.user.username}`;
    }
    
    if (groupIcon !== undefined && groupIcon !== group.groupIcon) {
      group.groupIcon = groupIcon;
      if (!systemMessageText) {
        systemMessageText = `Group icon was updated by ${req.user.name || req.user.username}`;
      }
    }

    if (systemMessageText) {
      await group.save();
      
      const io = req.app.get('io');
      if (io) {
        group.members.forEach((memberId) => {
          io.to(memberId.toString()).emit('group-details-updated', {
            groupId: group._id,
            groupName: group.groupName,
            groupIcon: group.groupIcon,
          });
        });

        // 👈 নতুন যোগ করা হলো: গ্রুপ এডিটের সিস্টেম মেসেজ
        await sendSystemMessage(group._id, req.user._id, systemMessageText, io);
      }
    }

    res.status(200).json({ status: 'success', message: 'Group details updated successfully', data: group });
  } catch (error) {
    next(error);
  }
};

module.exports = { 
  createGroup, 
  leaveGroup, 
  rotateGroupKeys,
  getUserGroups,
  getGroupDetails,
  addGroupMember,
  removeGroupMember,
  editGroup
};