import {createContext,useContext} from 'react';

const StudentContext = createContext();

export const useStudent = () => {
    const context = useContext(StudentContext);
    if(!context){
        throw new Error('useStudent must be used within StudentProvider');
    }
    return context;
}

export default StudentContext;