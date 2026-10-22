import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
    title:{
        type:String,
        required:[true, 'Please provide a title'],
        trim:true,
        maxlength:[100, 'Title cannot be exceed 100 characters']
    },
    content:{
        type:String,
        required:[true,'Please provide Content'],
        trim:true,
        maxlength:[1000,'Content cannot exceed 1000 Characters']
    }
},{ timestamps:true});


const Announcement =  mongoose.model('Announcement',announcementSchema);

export default Announcement;