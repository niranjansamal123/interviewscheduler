 
const generateUniqueToken = (length = 32) => {
    const crypto = require('crypto');
    return crypto.randomBytes(length).toString('hex');
};

const formatDateTime = (date) => {
    return new Date(date).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });
};

module.exports = {
    generateUniqueToken,
    formatDateTime
};
