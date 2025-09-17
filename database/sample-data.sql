 
USE InterviewScheduler;

-- Insert sample students
INSERT INTO Students (Name, Email, Phone)
VALUES
('John Doe', 'john.doe@example.com', '+1234567890'),
('Jane Smith', 'jane.smith@example.com', '+1234567891'),
('Alice Johnson', 'alice.johnson@example.com', '+1234567892');

-- Insert sample interview slots
INSERT INTO InterviewSlots (SlotDateTime, IsBooked, BookedByStudentId)
VALUES
(DATEADD(day, 1, GETDATE()), 0, NULL),
(DATEADD(day, 2, GETDATE()), 0, NULL),
(DATEADD(day, 3, GETDATE()), 0, NULL);

-- Insert sample interviews (no booked slots yet, invitation tokens can be NULL or unique tokens)
INSERT INTO Interviews (StudentId, SlotId, Interviewer, MeetingLink, Status, InvitationToken)
VALUES
(1, NULL, NULL, NULL, 'Invited', 'a1b2c3d4e5f60718293aabbccddeeff00112233445566778899aabbccddeeff'),
(2, NULL, NULL, NULL, 'Invited', 'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100'),
(3, NULL, NULL, NULL, 'Invited', '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff');
