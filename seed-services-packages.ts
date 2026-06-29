import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = "mongodb://root:secret@localhost:27017/proactive?authSource=admin";
const TENANT_ID = "6a3f7e69fd80b3e6b26c0762";

const serviceSchema = new mongoose.Schema({
  tenantId: mongoose.Schema.Types.ObjectId,
  name: String,
  isEnabled: Boolean,
  isRecurring: Boolean,
  assignmentMode: String,
  gstPercentage: Number,
  defaultBillingRate: Number,
  isBillable: Boolean,
});

const packageSchema = new mongoose.Schema({
  tenantId: mongoose.Schema.Types.ObjectId,
  name: String,
  frequency: String,
  defaultBillingAmount: Number,
  sacCode: String,
  gstPercentage: Number,
  serviceIds: [mongoose.Schema.Types.ObjectId],
  isActive: Boolean,
});

const Service = mongoose.model("Service", serviceSchema);
const Package = mongoose.model("Package", packageSchema);

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB.");

    // Clear existing data for this tenant
    await Service.deleteMany({ tenantId: TENANT_ID });
    await Package.deleteMany({ tenantId: TENANT_ID });
    console.log("Cleared old services and packages.");

    // Create 5 Dummy Services
    const servicesData = [
      {
        tenantId: TENANT_ID,
        name: "GST Return Filing (GSTR-1)",
        isEnabled: true,
        isRecurring: true,
        assignmentMode: "client_default_user",
        gstPercentage: 18,
        defaultBillingRate: 1500,
        isBillable: true,
      },
      {
        tenantId: TENANT_ID,
        name: "GST Return Filing (GSTR-3B)",
        isEnabled: true,
        isRecurring: true,
        assignmentMode: "client_default_user",
        gstPercentage: 18,
        defaultBillingRate: 1000,
        isBillable: true,
      },
      {
        tenantId: TENANT_ID,
        name: "Monthly Bookkeeping",
        isEnabled: true,
        isRecurring: true,
        assignmentMode: "client_default_user",
        gstPercentage: 18,
        defaultBillingRate: 5000,
        isBillable: true,
      },
      {
        tenantId: TENANT_ID,
        name: "TDS Return Filing",
        isEnabled: true,
        isRecurring: true,
        assignmentMode: "client_default_user",
        gstPercentage: 18,
        defaultBillingRate: 2000,
        isBillable: true,
      },
      {
        tenantId: TENANT_ID,
        name: "Income Tax Audit",
        isEnabled: true,
        isRecurring: false,
        assignmentMode: "client_default_user",
        gstPercentage: 18,
        defaultBillingRate: 15000,
        isBillable: true,
      },
    ];

    const insertedServices = await Service.insertMany(servicesData);
    console.log(`Inserted ${insertedServices.length} Services.`);

    const sIds = insertedServices.map((s) => s._id);

    // Create 2 Dummy Packages
    const packagesData = [
      {
        tenantId: TENANT_ID,
        name: "Complete Monthly Compliance",
        frequency: "monthly",
        defaultBillingAmount: 7000,
        sacCode: "998231",
        gstPercentage: 18,
        serviceIds: [sIds[0], sIds[1], sIds[2]],
        isActive: true,
      },
      {
        tenantId: TENANT_ID,
        name: "Annual Tax Package",
        frequency: "yearly",
        defaultBillingAmount: 25000,
        sacCode: "998232",
        gstPercentage: 18,
        serviceIds: [sIds[3], sIds[4]],
        isActive: true,
      },
    ];

    const insertedPackages = await Package.insertMany(packagesData);
    console.log(`Inserted ${insertedPackages.length} Packages.`);

    process.exit(0);
  } catch (error) {
    console.error("Error seeding data:", error);
    process.exit(1);
  }
}

seed();
