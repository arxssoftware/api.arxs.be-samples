import createClient from "./client.js";

const client = await createClient();

const userName = "arxssolutions";
const module = "NotificationDefect";
const kindString = "Onderhoud/herstelling";
const typeString = "Elektriciteit";
const subjectUniqueNumber = "UIN-004095";

// In order to retrieve a specific employee based on its username, currently we need to filter client-side.
// Future releases of the API will extend on the filtering capabilities of the GET endpoints.
const employees = await client.masterdata.employee.get();
const notifier = employees.filter(x => x.userName === userName)[0];

// CodeElements are generic settings used by every module.
// They are hierarchical (self-referential via ParentId). As such we build up the hierarchy from the flat list of CodeElements that we receive.
// In order to know which hierarchy to use for the module we're working with, we query for that module's specific metadata.
const codeElements = await client.masterdata.codeElement.get();
const moduleCategory = await client.masterdata.codeElement.getCategoryCodeForModule(module);
const moduleCodeElements = codeElements.filter(x => x.code === moduleCategory)[0].children;
const kind = moduleCodeElements.filter(x => x.name === kindString)[0];
const type = kind.children[0].children.filter(x => x.name === typeString)[0];

// In order to retrieve a specific equipment based on its uniqueNumber, currently we need to filter client-side.
// Future releases of the API will extend on the filtering capabilities of the GET endpoints.
const subject = (await client.assetManagement.equipment.get()).filter(x => x.uniqueNumber === subjectUniqueNumber)[0];

const imageUrl = await client.shared.blob.uploadToCloudStorage("../assets/img_macbook.png");

const attachmentInfo = client.shared.mapImageUrlToAttachmentInfo(imageUrl);

const data = {
    tags: [],
    notifier: { id: notifier.id, module: "Employee" },
    title: "Titel",
    description: "Omschrijving",
    subjects: [{ id: subject.id, module: "EquipmentInstallation" }],
    kind: { id: kind.id },
    type: { id: type.id },
    geoLocation: {
        street: "Sint-Agatha-Berchemselaan",
        number: "3",
        zipCode: "1081",
        city: "Koekelberg",
        latitude: 50.86499984826551,
        longitude: 4.318274640784401
    },
    attachmentInfo,
};

const taskRequestId = await client.facilityManagement.taskRequest.post(data);
console.log("Task Request Created:", taskRequestId);
