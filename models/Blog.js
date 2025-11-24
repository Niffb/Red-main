const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    excerpt: {
        type: String,
        required: true,
        trim: true,
        maxlength: 300
    },
    content: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true,
        enum: ['Product Update', 'Productivity', 'Automation', 'Insights', 'Security', 'Case Study', 'Integration', 'Announcement']
    },
    author: {
        type: String,
        default: 'RED AI Team'
    },
    featured: {
        type: Boolean,
        default: false
    },
    published: {
        type: Boolean,
        default: true
    },
    publishDate: {
        type: Date,
        default: Date.now
    },
    slug: {
        type: String,
        unique: true,
        sparse: true
    },
    tags: [{
        type: String,
        trim: true
    }],
    readTime: {
        type: Number,
        default: 5 // minutes
    }
}, {
    timestamps: true
});

// Generate slug from title before saving
blogSchema.pre('save', function(next) {
    if (this.isModified('title') && !this.slug) {
        this.slug = this.title
            .toLowerCase()
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .replace(/\s+/g, '-')
            .substring(0, 60);
    }
    next();
});

// Virtual for formatted publish date
blogSchema.virtual('formattedDate').get(function() {
    return this.publishDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
});

// Ensure virtual fields are serialized
blogSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Blog', blogSchema);
