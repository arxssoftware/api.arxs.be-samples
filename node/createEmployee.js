import createClient from "./client.js";

const client = await createClient();

// If a user is assigned to a legalStructure
// const legalStructures = await client.masterdata.legalStructure.get();
// const legalStructure = legalStructures.filter(x => x.name === "Legal structure name 123")[0];
// if (!legalStructure) {
//     throw "Legalstructure not found!";
// }

// If a user is assigned to a branch
const branches = await client.masterdata.branch.get();
const branch = branches.filter(x => x.name === "Branch name 123")[0];
if (!branch) {
    throw "Branch not found!";
}

// Determine the ids of the userRoles we want to add the user to
const userRoles = await client.masterdata.userRole.get();
const userRole = userRoles.filter(x => x.name === "User")[0];
if (!userRole) {
    throw "Userrole not found!";
}

const imageUrl = await client.shared.blob.uploadToCloudStorage("../assets/anonymous.png");
const attachmentInfo = client.shared.mapImageUrlToAttachmentInfo(imageUrl);

const data = {
    firstname: "John",
    surname: "Doe",
    userName: "johndoe",
    emails: [{ isPreferred: true, email: "john.doe@company.com" }],
    assignments: [
        { legalStructure: { id: branch.legalStructure.id }, branch: { id: branch.id }, isPreferred: true },
    ],
    attachmentInfo,
};

const employeeId = await client.masterdata.employee.post(data);
console.log("Employee Created:", employeeId);

await client.masterdata.userRole.addUsers(userRole.id, [employeeId]);
console.log("Employee added to role.");