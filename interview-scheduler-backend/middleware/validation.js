 
const Joi = require('joi');

const validationSchemas = {
    student: Joi.object({
        name: Joi.string().min(2).max(255).required(),
        email: Joi.string().email().required(),
        phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/).allow(''),
        resumeLink: Joi.string().uri().allow('')
    }),

    slot: Joi.object({
        slotDateTime: Joi.date().min('now').required()
    }),

    slotBooking: Joi.object({
        slotId: Joi.number().integer().positive().required(),
        token: Joi.string().length(64).required()
    })
};

const validate = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                error: 'Validation error',
                details: error.details.map(detail => detail.message)
            });
        }
        next();
    };
};

module.exports = {
    validateStudent: validate(validationSchemas.student),
    validateSlot: validate(validationSchemas.slot),
    validateSlotBooking: validate(validationSchemas.slotBooking)
};
