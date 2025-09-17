-- Create Database
CREATE DATABASE InterviewScheduler;
GO

USE InterviewScheduler;
GO

-- Students Table - Enhanced with resume filename field
CREATE TABLE Students (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(255) NOT NULL,
    Email NVARCHAR(255) UNIQUE NOT NULL,
    Phone NVARCHAR(20),
    ResumeLink NVARCHAR(500), -- File path for resume storage
    ResumeFileName NVARCHAR(255), -- Original filename for display/download
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE()
);
GO

-- Interview Slots Table - Enhanced with interviewer info and better constraints
CREATE TABLE InterviewSlots (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    SlotDateTime DATETIME2 NOT NULL,
    Interviewer NVARCHAR(255) NOT NULL, -- Required field for slot creation
    MeetingLink NVARCHAR(500), -- Zoom/Teams meeting link (optional)
    IsBooked BIT DEFAULT 0,
    BookedByStudentId INT NULL,
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE(),
    
    -- Constraints
    CONSTRAINT FK_InterviewSlots_Students FOREIGN KEY (BookedByStudentId) 
        REFERENCES Students(Id) ON DELETE SET NULL
);
GO

-- Interviews Table - Enhanced with token expiration and better status tracking
CREATE TABLE Interviews (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    StudentId INT NOT NULL,
    SlotId INT NULL, -- Can be NULL until slot is selected
    Status NVARCHAR(50) DEFAULT 'Invited', -- 'Invited', 'Scheduled', 'Completed', 'Cancelled'
    InvitationToken NVARCHAR(255) UNIQUE NOT NULL, -- Required for slot selection
    TokenExpiredAt DATETIME2 NULL, -- Set when student books a slot (expires the token)
    Interviewer NVARCHAR(255), -- Copied from slot when booked
    MeetingLink NVARCHAR(500), -- Copied from slot when booked
    Notes NVARCHAR(MAX), -- Interview notes/feedback
    CreatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedAt DATETIME2 DEFAULT GETDATE(),
    
    -- Constraints
    CONSTRAINT FK_Interviews_Students FOREIGN KEY (StudentId) 
        REFERENCES Students(Id) ON DELETE CASCADE,
    CONSTRAINT FK_Interviews_Slots FOREIGN KEY (SlotId) 
        REFERENCES InterviewSlots(Id) ON DELETE SET NULL,
    CONSTRAINT CK_Interviews_Status CHECK (Status IN ('Invited', 'Scheduled', 'Completed', 'Cancelled', 'No-Show'))
);
GO

-- Add triggers to update UpdatedAt timestamp
CREATE TRIGGER tr_Students_UpdatedAt ON Students
    AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Students 
    SET UpdatedAt = GETDATE() 
    WHERE Id IN (SELECT Id FROM inserted);
END;
GO

CREATE TRIGGER tr_Interviews_UpdatedAt ON Interviews
    AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Interviews 
    SET UpdatedAt = GETDATE() 
    WHERE Id IN (SELECT Id FROM inserted);
END;
GO

CREATE TRIGGER tr_InterviewSlots_UpdatedAt ON InterviewSlots
    AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE InterviewSlots 
    SET UpdatedAt = GETDATE() 
    WHERE Id IN (SELECT Id FROM inserted);
END;
GO

-- Enhanced indexes for better performance
CREATE INDEX IX_Students_Email ON Students(Email);
CREATE INDEX IX_Students_CreatedAt ON Students(CreatedAt DESC);
CREATE INDEX IX_Students_Name ON Students(Name);
GO

CREATE INDEX IX_InterviewSlots_DateTime ON InterviewSlots(SlotDateTime ASC);
CREATE INDEX IX_InterviewSlots_IsBooked ON InterviewSlots(IsBooked, SlotDateTime);
CREATE INDEX IX_InterviewSlots_Interviewer ON InterviewSlots(Interviewer);
GO

CREATE INDEX IX_Interviews_Token ON Interviews(InvitationToken);
CREATE INDEX IX_Interviews_StudentId ON Interviews(StudentId);
CREATE INDEX IX_Interviews_Status ON Interviews(Status);
CREATE INDEX IX_Interviews_TokenExpired ON Interviews(TokenExpiredAt);
CREATE INDEX IX_Interviews_SlotId ON Interviews(SlotId);
GO

-- Create a view for easy querying of complete interview information
CREATE VIEW vw_InterviewDetails AS
SELECT 
    s.Id as StudentId,
    s.Name as StudentName,
    s.Email as StudentEmail,
    s.Phone as StudentPhone,
    s.ResumeLink,
    s.ResumeFileName,
    CASE 
        WHEN s.ResumeLink IS NOT NULL AND s.ResumeLink != '' THEN 1 
        ELSE 0 
    END as HasResume,
    s.CreatedAt as StudentCreatedAt,
    s.UpdatedAt as StudentUpdatedAt,
    
    i.Id as InterviewId,
    i.Status as InterviewStatus,
    i.InvitationToken,
    i.TokenExpiredAt,
    CASE 
        WHEN i.TokenExpiredAt IS NOT NULL THEN 1 
        ELSE 0 
    END as IsTokenExpired,
    i.Notes as InterviewNotes,
    i.CreatedAt as InterviewCreatedAt,
    i.UpdatedAt as InterviewUpdatedAt,
    
    sl.Id as SlotId,
    sl.SlotDateTime,
    sl.Interviewer as SlotInterviewer,
    sl.MeetingLink as SlotMeetingLink,
    sl.IsBooked as SlotIsBooked,
    sl.CreatedAt as SlotCreatedAt,
    
    -- Derived fields for convenience
    CASE 
        WHEN i.Status = 'Scheduled' AND sl.SlotDateTime IS NOT NULL THEN 
            CASE 
                WHEN sl.SlotDateTime < GETDATE() THEN 'Past'
                WHEN CAST(sl.SlotDateTime AS DATE) = CAST(GETDATE() AS DATE) THEN 'Today'
                WHEN CAST(sl.SlotDateTime AS DATE) = CAST(DATEADD(DAY, 1, GETDATE()) AS DATE) THEN 'Tomorrow'
                ELSE 'Upcoming'
            END
        ELSE NULL 
    END as SlotTiming
FROM Students s
LEFT JOIN Interviews i ON s.Id = i.StudentId
LEFT JOIN InterviewSlots sl ON i.SlotId = sl.Id;
GO

-- Create view for available slots (frequently queried)
CREATE VIEW vw_AvailableSlots AS
SELECT 
    Id,
    SlotDateTime,
    Interviewer,
    MeetingLink,
    CreatedAt,
    DATENAME(WEEKDAY, SlotDateTime) as DayOfWeek,
    CAST(SlotDateTime AS DATE) as SlotDate,
    CAST(SlotDateTime AS TIME) as SlotTime,
    CASE 
        WHEN CAST(SlotDateTime AS DATE) = CAST(GETDATE() AS DATE) THEN 'Today'
        WHEN CAST(SlotDateTime AS DATE) = CAST(DATEADD(DAY, 1, GETDATE()) AS DATE) THEN 'Tomorrow'
        WHEN SlotDateTime <= DATEADD(DAY, 7, GETDATE()) THEN 'This Week'
        ELSE 'Later'
    END as TimeCategory
FROM InterviewSlots 
WHERE IsBooked = 0 
AND SlotDateTime > GETDATE()
AND SlotDateTime > DATEADD(MINUTE, 30, GETDATE()); -- 30-minute buffer
GO

-- Create stored procedures for common operations
CREATE PROCEDURE sp_CreateInterview
    @StudentId INT,
    @InvitationToken NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;
    
    BEGIN TRY
        INSERT INTO Interviews (StudentId, InvitationToken, Status, CreatedAt)
        VALUES (@StudentId, @InvitationToken, 'Invited', GETDATE());
        
        SELECT SCOPE_IDENTITY() as InterviewId;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

CREATE PROCEDURE sp_BookSlot
    @InvitationToken NVARCHAR(255),
    @SlotId INT
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @StudentId INT;
    DECLARE @Interviewer NVARCHAR(255);
    DECLARE @MeetingLink NVARCHAR(500);
    DECLARE @ErrorMessage NVARCHAR(500);
    
    BEGIN TRY
        BEGIN TRANSACTION;
        
        -- Get student ID from token and validate
        SELECT @StudentId = StudentId 
        FROM Interviews 
        WHERE InvitationToken = @InvitationToken 
        AND TokenExpiredAt IS NULL 
        AND Status = 'Invited';
        
        IF @StudentId IS NULL
        BEGIN
            SET @ErrorMessage = 'Invalid or expired invitation token';
            THROW 50001, @ErrorMessage, 1;
        END
        
        -- Get slot details and check availability
        SELECT @Interviewer = Interviewer, @MeetingLink = MeetingLink 
        FROM InterviewSlots 
        WHERE Id = @SlotId 
        AND IsBooked = 0 
        AND SlotDateTime > GETDATE();
        
        IF @Interviewer IS NULL
        BEGIN
            SET @ErrorMessage = 'Slot is not available or has passed';
            THROW 50002, @ErrorMessage, 1;
        END
        
        -- Mark slot as booked
        UPDATE InterviewSlots 
        SET IsBooked = 1, 
            BookedByStudentId = @StudentId,
            UpdatedAt = GETDATE()
        WHERE Id = @SlotId AND IsBooked = 0;
        
        IF @@ROWCOUNT = 0
        BEGIN
            SET @ErrorMessage = 'Slot was just booked by another user';
            THROW 50003, @ErrorMessage, 1;
        END
        
        -- Update interview with slot details and expire token
        UPDATE Interviews 
        SET SlotId = @SlotId, 
            Status = 'Scheduled',
            Interviewer = @Interviewer,
            MeetingLink = @MeetingLink,
            TokenExpiredAt = GETDATE(),
            UpdatedAt = GETDATE()
        WHERE InvitationToken = @InvitationToken;
        
        COMMIT TRANSACTION;
        
        -- Return success details
        SELECT 
            @StudentId as StudentId,
            @SlotId as SlotId,
            @Interviewer as Interviewer,
            @MeetingLink as MeetingLink,
            'Success' as Result;
            
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- Enhanced function to check token validity
CREATE FUNCTION fn_IsTokenValid(@InvitationToken NVARCHAR(255))
RETURNS BIT
AS
BEGIN
    DECLARE @IsValid BIT = 0;
    
    IF EXISTS (
        SELECT 1 FROM Interviews 
        WHERE InvitationToken = @InvitationToken 
        AND TokenExpiredAt IS NULL 
        AND Status = 'Invited'
    )
    SET @IsValid = 1;
    
    RETURN @IsValid;
END;
GO

-- Function to get slot availability statistics
CREATE FUNCTION fn_GetSlotStats(@InterviewerId NVARCHAR(255) = NULL)
RETURNS TABLE
AS
RETURN
(
    SELECT 
        COUNT(*) as TotalSlots,
        SUM(CASE WHEN IsBooked = 1 THEN 1 ELSE 0 END) as BookedSlots,
        SUM(CASE WHEN IsBooked = 0 THEN 1 ELSE 0 END) as AvailableSlots,
        SUM(CASE WHEN IsBooked = 0 AND SlotDateTime > GETDATE() THEN 1 ELSE 0 END) as FutureAvailableSlots,
        SUM(CASE WHEN IsBooked = 0 AND CAST(SlotDateTime AS DATE) = CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) as TodayAvailable,
        SUM(CASE WHEN IsBooked = 0 AND CAST(SlotDateTime AS DATE) = CAST(DATEADD(DAY, 1, GETDATE()) AS DATE) THEN 1 ELSE 0 END) as TomorrowAvailable
    FROM InterviewSlots
    WHERE (@InterviewerId IS NULL OR Interviewer = @InterviewerId)
);
GO

-- Create database maintenance procedures
CREATE PROCEDURE sp_CleanupExpiredTokens
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Clean up tokens that are older than 30 days
    UPDATE Interviews 
    SET Notes = CONCAT(ISNULL(Notes, ''), '; Token cleaned up on ', GETDATE())
    WHERE TokenExpiredAt IS NOT NULL 
    AND TokenExpiredAt < DATEADD(DAY, -30, GETDATE())
    AND InvitationToken IS NOT NULL;
    
    -- Don't actually delete tokens for audit purposes, just log cleanup
    SELECT @@ROWCOUNT as TokensProcessed;
END;
GO

CREATE PROCEDURE sp_GetDashboardStats
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT 
        -- Student Stats
        (SELECT COUNT(*) FROM Students) as TotalStudents,
        (SELECT COUNT(*) FROM Students WHERE ResumeLink IS NOT NULL) as StudentsWithResume,
        (SELECT COUNT(*) FROM Students WHERE CreatedAt >= CAST(GETDATE() AS DATE)) as StudentsAddedToday,
        
        -- Slot Stats
        (SELECT COUNT(*) FROM InterviewSlots) as TotalSlots,
        (SELECT COUNT(*) FROM InterviewSlots WHERE IsBooked = 0 AND SlotDateTime > GETDATE()) as AvailableSlots,
        (SELECT COUNT(*) FROM InterviewSlots WHERE IsBooked = 1) as BookedSlots,
        (SELECT COUNT(*) FROM InterviewSlots WHERE CAST(SlotDateTime AS DATE) = CAST(GETDATE() AS DATE) AND IsBooked = 0) as TodayAvailable,
        
        -- Interview Stats
        (SELECT COUNT(*) FROM Interviews) as TotalInterviews,
        (SELECT COUNT(*) FROM Interviews WHERE Status = 'Invited') as PendingInvitations,
        (SELECT COUNT(*) FROM Interviews WHERE Status = 'Scheduled') as ScheduledInterviews,
        (SELECT COUNT(*) FROM Interviews WHERE Status = 'Completed') as CompletedInterviews;
END;
GO

-- Insert some sample data for testing (optional)
/*
-- Insert sample interview slots
INSERT INTO InterviewSlots (SlotDateTime, Interviewer, MeetingLink) VALUES
('2025-09-16 10:00:00', 'John Smith', 'https://zoom.us/j/123456789'),
('2025-09-16 14:00:00', 'Jane Doe', 'https://teams.microsoft.com/l/meetup-join/xyz'),
('2025-09-17 09:00:00', 'Bob Johnson', 'https://zoom.us/j/987654321'),
('2025-09-17 11:00:00', 'Alice Cooper', 'https://zoom.us/j/456789123'),
('2025-09-18 13:00:00', 'David Wilson', 'https://meet.google.com/abc-defg-hij');

-- Insert sample students
INSERT INTO Students (Name, Email, Phone) VALUES
('Alice Brown', 'alice.brown@email.com', '+1-555-0101'),
('Charlie Davis', 'charlie.davis@email.com', '+1-555-0102'),
('Eve Wilson', 'eve.wilson@email.com', '+1-555-0103'),
('Mike Johnson', 'mike.johnson@email.com', '+1-555-0104'),
('Sarah Parker', 'sarah.parker@email.com', '+1-555-0105');
*/

-- Test the setup
SELECT 'Database setup completed successfully' as Status;
GO

-- Test views
SELECT COUNT(*) as StudentsCount FROM Students;
SELECT COUNT(*) as SlotsCount FROM InterviewSlots;
SELECT COUNT(*) as InterviewsCount FROM Interviews;
GO

-- Test functions
SELECT * FROM fn_GetSlotStats(DEFAULT);
GO

-- Test dashboard stats
EXEC sp_GetDashboardStats;
GO

PRINT 'Database schema created successfully!';
PRINT 'You can now test the bulk slot creation functionality.';
GO
