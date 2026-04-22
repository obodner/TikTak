# PRD: Admin Ticket Comments

## 1. Problem Statement
Building committee members (Admins) currently have no way to record internal progress or notes on a maintenance ticket (e.g., "Technician scheduled for Tuesday"). This leads to confusion when multiple admins manage the same building or when tracking long-term repairs.

## 2. Target User
- **Building Committee (Vaad)**: Managing repairs and coordinating with vendors.

## 3. User Stories
- **Add Comment**: As an Admin, I want to click on a ticket and add a text note so my colleagues know the latest status.
- **View History**: As an Admin, I want to see a history of previous notes concatenated together so I can see the "story" of the repair.
- **Remove Note**: As an Admin, I want to delete a previous note if it was an error or is no longer relevant.
- **Discard**: As an Admin, I want to cancel my current draft if I change my mind.

## 4. Functional Requirements
- **Interaction**: A "Comment" icon button on each ticket card in the Kanban board.
- **Modal View**:
    - **Top Section**: Scrollable list of existing comments (concatenated/list view).
    - **Bottom Section**: Textarea for a new comment.
    - **Actions**:
        - `Save`: Persists the new comment.
        - `Cancel`: Closes modal without saving.
        - `Delete`: Removes an existing individual comment from the history.
- **Persistence**:
    - Stored as an array of objects `adminComments: [{ text, createdAt, id }]` in the `tenants/{tenantId}/tickets/{ticketId}` document.
    - **Timestamp**: Each comment MUST store its creation date in ISO 8601 format for accurate sorting.

## 5. Technical Specification (Draft)
- **Frontend**:
    - Component: `CommentModal.tsx` utilizing Tailwind for modern aesthetics.
    - State: `useState` for the new comment draft and `useEffect` to fetch/refresh the ticket if needed.
- **Backend (Firestore)**:
    - Use `arrayUnion()` for saving new comments (atomic).
    - Use `arrayRemove()` or `updateDoc` with a filtered array for deletion.
- **Security**: 
    - Existing Firestore rules for `tenants/{tenantId}/tickets` already verify the `tenantId` context and admin auth.

## 6. Success Metrics
- Reduction in "verbal handovers" between committee members.
- Increased "Traceability" of maintenance issues.
